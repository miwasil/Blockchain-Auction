// Konfiguracja do odczytu prawdziwej ceny z Mainnetu (Chainlink ETH/USD)
const ALCHEMY_URL = "https://eth-mainnet.g.alchemy.com/v2/wtJBAQ8bkOmO5s8EDWdvH";
const CHAINLINK_ETH_USD_ADDRESS = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const CHAINLINK_ABI = ["function latestRoundData() view returns (uint80, int256 answer, uint256, uint256, uint80)"];

// Pobieramy ID aukcji z paska adresu przeglądarki (np. ?id=1)
const urlParams = new URLSearchParams(window.location.search);
const auctionId = urlParams.get("id");

if (!auctionId) {
    document.body.innerHTML = "<h2>Nie podano ID aukcji w linku!</h2>";
}

async function fetchBlockchainState() {
    document.getElementById("dutch-ui").style.display = "block";
    document.getElementById("english-ui").style.display = "none";   // TRZEBA TO ZMIENIC PO ZROBIENU KODU DLA AUCKJI ANGIELSKIEJ
    if (!auctionContract || !signer) return;
    
    try {
        // 1. Pobieramy twarde dane o tej konkretnej aukcji z bazy Managera
        const auc = await auctionContract.auctions(auctionId);
        const title = auc.title;
        const description = auc.description; // Pobieramy opis
        const isClosed = auc.isClosed;
        const sellerAddress = auc.seller;
        const buyerAddress = auc.buyer;
        const debtWei = auc.debt;
        
        const userAddress = await signer.getAddress();

        // Wypełniamy nagłówki na stronie
        document.getElementById("img").style.display = "none"; // Chowamy img z mocka
        document.getElementById("title").innerText = `${title} (Aukcja #${auctionId})`;
        document.getElementById("desc").innerText = `Opis: ${description ? description : "Brak opisu"}\nSprzedawca: ${sellerAddress.substring(0,6)}...`;

        // 2. Pobieramy kurs USD z prawdziwego Ethereum (Alchemy / Chainlink)
        let ethUsdPrice = 0;
        try {
            const mainnetProvider = new ethers.providers.JsonRpcProvider(ALCHEMY_URL);
            const priceFeed = new ethers.Contract(CHAINLINK_ETH_USD_ADDRESS, CHAINLINK_ABI, mainnetProvider);
            const roundData = await priceFeed.latestRoundData();
            ethUsdPrice = roundData.answer.toNumber() / 1e8; 
        } catch (chainlinkErr) {
            console.error("Nie udało się pobrać kursu z Alchemy:", chainlinkErr);
        }

        // 3. Wyliczamy obecną cenę ETH i formatujemy tekst z ceną w USD
        const currentPriceWei = await auctionContract.getCurrentPrice(auctionId);
        const ethValue = ethers.utils.formatEther(currentPriceWei);
        
        let priceText = `Obecna cena: ${ethValue} ETH`;
        if (ethUsdPrice > 0) {
            const usdValue = (parseFloat(ethValue) * ethUsdPrice).toFixed(2);
            priceText += ` (~ ${usdValue} USD)`;
        }

        // Pobieramy przyciski zakupu
        const btn100 = document.getElementById("bcBuyBtn");
        const btn50 = document.getElementById("bcBuy50Btn");

        // 4. LOGIKA RENDEROWANIA (Kim jesteś i jaki jest stan)
        if (isClosed) {
            document.getElementById("bc-price").innerText = "AUKCJA ZAKOŃCZONA (Przedmiot sprzedany)";
            btn100.style.display = "none";
            btn50.style.display = "none";

            // Jeśli to Ty kupiłeś na raty (50/50) i masz dług
            if (userAddress === buyerAddress && debtWei.gt(0)) {
                document.getElementById("bc-price").innerText += `\nMasz dług do spłaty: ${ethers.utils.formatEther(debtWei)} ETH`;
                
                btn50.style.display = "inline-block";
                btn50.innerText = "Spłać resztę długu";
                btn50.style.backgroundColor = "#dc3545"; // Czerwony
                btn50.onclick = payDebt; 
            }
        } else if (userAddress === sellerAddress) {
            // Jeśli jesteś sprzedawcą - blokujemy przyciski
            document.getElementById("bc-price").innerText = `${priceText}\n(To jest Twoja aukcja)`;
            btn100.style.display = "none";
            btn50.style.display = "none";
        } else {
            // Jesteś kupującym - wyświetlamy spadającą cenę wraz z USD
            document.getElementById("bc-price").innerText = priceText;
            
            btn100.style.display = "inline-block";
            btn50.style.display = "inline-block";
            
            btn100.onclick = () => executePurchase(false);
            btn50.onclick = () => executePurchase(true);
        }

    } catch (error) {
        console.error("Błąd pobierania stanu z blockchaina", error);
    }
}

// Funkcja zakupu (musi podać auctionId do smart kontraktu)
async function executePurchase(is5050) {
    if (!auctionContract) return alert("Połącz portfel!");
    try {
        const currentPriceWei = await auctionContract.getCurrentPrice(auctionId);
        const amountToSend = is5050 ? currentPriceWei.div(2) : currentPriceWei;

        alert("Zaraz otworzy się okno MetaMask. Potwierdź w nim transakcję.");
        
        // Tutaj kod czeka na kliknięcie w MetaMasku
        const tx = await auctionContract.buy(auctionId, is5050, { value: amountToSend });
        
        console.log("Transakcja zaakceptowana w portfelu. Oczekuję na blok...");
        await tx.wait(); // Czekamy na wykopanie bloku w sieci
        
        alert("Sukces! Transakcja została sfinalizowana.");
        fetchBlockchainState(); 
    } catch (error) {
        console.error("Błąd transakcji:", error);
        alert("Transakcja została odrzucona lub wystąpił błąd.");
    }
}

// Funkcja spłaty długu (musi podać auctionId do smart kontraktu)
async function payDebt() {
    if (!auctionContract) return alert("Połącz portfel!");
    try {
        const auc = await auctionContract.auctions(auctionId);
        
        // 1. Najpierw informujemy użytkownika
        alert("Zaraz otworzy się okno MetaMask. Potwierdź w nim transakcję spłaty reszty długu.");
        
        // 2. Skrypt czeka na kliknięcie w MetaMasku
        const tx = await auctionContract.payRemainingDebt(auctionId, { value: auc.debt });
        
        console.log("Transakcja spłaty zaakceptowana w portfelu. Oczekuję na blok...");
        
        // 3. Czekamy na wykopanie bloku w sieci
        await tx.wait();
        
        // 4. Potwierdzenie sukcesu
        alert("Sukces! Dług został spłacony, a przedmiot jest w 100% Twój.");
        fetchBlockchainState();
    } catch (error) {
        console.error("Błąd spłaty:", error);
        alert("Transakcja spłaty została odrzucona lub wystąpił błąd.");
    }
}

// Odświeżaj stan co 5 sekund (cena spada)
setInterval(() => {
    if (auctionContract) fetchBlockchainState();
}, 5000);

setTimeout(() => {
    if (auctionContract) fetchBlockchainState();
}, 1000);