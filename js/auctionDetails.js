// ============================================================
//  KONFIGURACJA ZEWNĘTRZNA (ALCHEMY & CHAINLINK)
// ============================================================
const ALCHEMY_URL = "https://eth-mainnet.g.alchemy.com/v2/wtJBAQ8bkOmO5s8EDWdvH";
const CHAINLINK_ETH_USD_ADDRESS = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const CHAINLINK_ABI = ["function latestRoundData() view returns (uint80, int256 answer, uint256, uint256, uint80)"];

const urlParams = new URLSearchParams(window.location.search);
const auctionId = urlParams.get("id");

if (!auctionId) {
    document.body.innerHTML = "<h2>Nie podano ID aukcji w linku!</h2>";
}

// ============================================================
//  GŁÓWNA FUNKCJA ODŚWIEŻANIA STANU
// ============================================================

async function fetchBlockchainState() {
    if (!auctionContract || !signer) return;

    try {
        const auc = await auctionContract.auctions(auctionId);
        const isEnglish = auc.auctionType === 1;

        document.getElementById("img").style.display = "none";
        document.getElementById("title").innerText = `${auc.title} (Aukcja #${auctionId})`;
        document.getElementById("desc").innerText = `Sprzedawca: ${auc.seller.substring(0, 6)}...`;

        // Pobieramy kurs USD z prawdziwego Ethereum (Alchemy / Chainlink)
        let ethUsdPrice = 0;
        try {
            const mainnetProvider = new ethers.providers.JsonRpcProvider(ALCHEMY_URL);
            const priceFeed = new ethers.Contract(CHAINLINK_ETH_USD_ADDRESS, CHAINLINK_ABI, mainnetProvider);
            const roundData = await priceFeed.latestRoundData();
            ethUsdPrice = roundData.answer.toNumber() / 1e8; 
        } catch (chainlinkErr) {
            console.error("Nie udało się pobrać kursu z Alchemy:", chainlinkErr);
        }

        // Renderujemy odpowiednie UI i przekazujemy kurs USD
        if (isEnglish) {
            document.getElementById("dutch-ui").style.display = "none";
            document.getElementById("english-ui").style.display = "block";
            await renderEnglishUI(auc, ethUsdPrice);
        } else {
            document.getElementById("dutch-ui").style.display = "block";
            document.getElementById("english-ui").style.display = "none";
            await renderDutchUI(auc, ethUsdPrice);
        }
    } catch (error) {
        console.error("Błąd pobierania stanu z blockchaina:", error);
    }
}

// ============================================================
//  AUKCJA HOLENDERSKA
// ============================================================

async function renderDutchUI(auc, ethUsdPrice) {
    const userAddress = await signer.getAddress();
    const isClosed = auc.isClosed;
    const sellerAddress = auc.seller;
    const buyerAddress = auc.buyer;
    const debtWei = auc.debt;

    const btn100 = document.getElementById("bcBuyBtn");
    const btn50 = document.getElementById("bcBuy50Btn");

    // Wyliczamy obecną cenę ETH i formatujemy tekst w USD
    const currentPriceWei = await auctionContract.getCurrentPrice(auctionId);
    const ethValue = ethers.utils.formatEther(currentPriceWei);
    const ethValueDisplay = parseFloat(ethValue).toFixed(4); // Ograniczamy do 4 miejsc
    
    let priceText = `Obecna cena: ${ethValueDisplay} ETH`;
    if (ethUsdPrice > 0) {
        const usdValue = (parseFloat(ethValue) * ethUsdPrice).toFixed(2);
        priceText += ` (~ ${usdValue} USD)`;
    }

    if (isClosed) {
        document.getElementById("bc-price").innerText = "AUKCJA ZAKOŃCZONA (Przedmiot sprzedany)";
        btn100.style.display = "none";
        btn50.style.display = "none";

        if (userAddress.toLowerCase() === buyerAddress.toLowerCase() && debtWei.gt(0)) {
            document.getElementById("bc-price").innerText +=
                `\nMasz dług do spłaty: ${ethers.utils.formatEther(debtWei)} ETH`;
            btn50.style.display = "inline-block";
            btn50.innerText = "Spłać resztę długu";
            btn50.style.backgroundColor = "#dc3545";
            btn50.onclick = payDebt;
        }
    } else if (userAddress.toLowerCase() === sellerAddress.toLowerCase()) {
        document.getElementById("bc-price").innerText = `${priceText}\n(To jest Twoja aukcja)`;
        btn100.style.display = "none";
        btn50.style.display = "none";
    } else {
        document.getElementById("bc-price").innerText = priceText;
        btn100.style.display = "inline-block";
        btn50.style.display = "inline-block";
        btn100.onclick = () => executePurchase(false);
        btn50.onclick = () => executePurchase(true);
    }
}

async function executePurchase(is5050) {
    if (!auctionContract) return alert("Połącz portfel!");
    try {
        const currentPriceWei = await auctionContract.getCurrentPrice(auctionId);
        const amountToSend = is5050 ? currentPriceWei.div(2) : currentPriceWei;

        alert("Zaraz otworzy się okno MetaMask. Potwierdź w nim transakcję.");
        const tx = await auctionContract.buy(auctionId, is5050, { value: amountToSend });
        console.log("Transakcja zaakceptowana. Oczekuję na blok...");
        await tx.wait();
        alert("Sukces! Transakcja została sfinalizowana.");
        fetchBlockchainState();
    } catch (error) {
        console.error("Błąd transakcji:", error);
        alert("Transakcja została odrzucona lub wystąpił błąd.");
    }
}

async function payDebt() {
    if (!auctionContract) return alert("Połącz portfel!");
    try {
        const auc = await auctionContract.auctions(auctionId);
        alert("Zaraz otworzy się okno MetaMask. Potwierdź w nim transakcję spłaty.");
        const tx = await auctionContract.payRemainingDebt(auctionId, { value: auc.debt });
        console.log("Transakcja spłaty zaakceptowana. Oczekuję na blok...");
        await tx.wait();
        alert("Sukces! Dług został spłacony.");
        fetchBlockchainState();
    } catch (error) {
        console.error("Błąd spłaty:", error);
        alert("Transakcja spłaty została odrzucona lub wystąpił błąd.");
    }
}

// ============================================================
//  AUKCJA ANGIELSKA
// ============================================================

async function renderEnglishUI(auc, ethUsdPrice) {
    const userAddress = (await signer.getAddress()).toLowerCase();
    const sellerAddress = auc.seller.toLowerCase();
    const isClosed = auc.isClosed;

    const highestBid = auc.highestBid;
    const highestBidder = auc.highestBidder.toLowerCase();
    const minBid = auc.minBid;
    const timeLeft = await auctionContract.getTimeLeft(auctionId);

    const bidInfo = document.getElementById("highest-bid-info");
    const bidInput = document.getElementById("bidAmount");
    const bidBtn = document.getElementById("bidBtn");
    const endBtn = document.getElementById("endAuctionBtn");
    const withdrawBtn = document.getElementById("withdrawBtn");

    // Odliczanie czasu
    const minutes = Math.floor(timeLeft.toNumber() / 60);
    const seconds = timeLeft.toNumber() % 60;
    const timeStr = timeLeft.toNumber() > 0
        ? `Czas do końca: ${minutes}m ${seconds}s`
        : "Czas upłynął";

    // Formatowanie najwyższej oferty z USD
    const highestBidEth = ethers.utils.formatEther(highestBid);
    let highestBidText = `${highestBidEth} ETH`;
    if (ethUsdPrice > 0 && highestBid.gt(0)) {
        highestBidText += ` (~ ${(parseFloat(highestBidEth) * ethUsdPrice).toFixed(2)} USD)`;
    }

    // Formatowanie minimalnej oferty z USD
    const minBidEth = ethers.utils.formatEther(minBid);
    let minBidText = `${minBidEth} ETH`;
    if (ethUsdPrice > 0 && highestBid.isZero()) {
        minBidText += ` (~ ${(parseFloat(minBidEth) * ethUsdPrice).toFixed(2)} USD)`;
    }

    if (highestBid.gt(0)) {
        bidInfo.innerText =
            `Najwyższa oferta: ${highestBidText}` +
            ` | Lider: ${auc.highestBidder.substring(0, 6)}...` +
            `\n${timeStr}`;
    } else {
        bidInfo.innerText =
            `Brak ofert. Minimalna oferta: ${minBidText}` +
            `\n${timeStr}`;
    }

    // Chowamy wszystko domyślnie, potem odkrywamy co trzeba
    bidInput.style.display = "none";
    bidBtn.style.display = "none";
    endBtn.style.display = "none";
    withdrawBtn.style.display = "none";

    if (isClosed) {
        const winnerText = auc.buyer !== ethers.constants.AddressZero
            ? `Wygrał: ${auc.buyer.substring(0, 6)}... za ${highestBidText}`
            : "Nikt nie licytował — aukcja zakończona bez sprzedaży.";
        bidInfo.innerText = `AUKCJA ZAKOŃCZONA\n${winnerText}`;

        // Jeśli przebity licytant ma środki do odebrania
        await showWithdrawIfNeeded(withdrawBtn);
        return;
    }

    if (userAddress === sellerAddress) {
        // Sprzedawca widzi przycisk "Zakończ" tylko gdy czas minął
        if (timeLeft.toNumber() === 0) {
            endBtn.style.display = "inline-block";
            endBtn.onclick = finalizeAuction;
        } else {
            bidInfo.innerText += "\n(To jest Twoja aukcja)";
        }
        return;
    }

    // Zwykły użytkownik
    if (timeLeft.toNumber() === 0) {
        // Czas upłynął — można sfinalizować (jeśli był liderem)
        if (userAddress === highestBidder) {
            endBtn.style.display = "inline-block";
            endBtn.innerText = "Odbierz przedmiot (finalizuj)";
            endBtn.onclick = finalizeAuction;
        }
        await showWithdrawIfNeeded(withdrawBtn);
        return;
    }

    // Aukcja aktywna — pokaż formularz licytacji
    bidInput.style.display = "inline-block";
    bidBtn.style.display = "inline-block";
    bidBtn.onclick = placeBid;

    // Podpowiedź minimalnej kwoty
    const minRequired = highestBid.gt(0)
        ? ethers.utils.formatEther(highestBid.add(ethers.utils.parseEther("0.001")))
        : ethers.utils.formatEther(minBid);
    bidInput.placeholder = `Min. oferta: ${minRequired} ETH`;

    // Pokaż przycisk wypłaty jeśli przebity
    await showWithdrawIfNeeded(withdrawBtn);
}

async function showWithdrawIfNeeded(withdrawBtn) {
    try {
        const userAddress = await signer.getAddress();
        const pending = await auctionContract.pendingReturns(auctionId, userAddress);
        if (pending.gt(0)) {
            withdrawBtn.style.display = "inline-block";
            withdrawBtn.innerText = `Odbierz ${ethers.utils.formatEther(pending)} ETH`;
            withdrawBtn.onclick = withdrawReturn;
        }
    } catch (e) {
        console.error("Błąd sprawdzania zwrotu:", e);
    }
}

async function placeBid() {
    if (!auctionContract) return alert("Połącz portfel!");
    const bidInput = document.getElementById("bidAmount");
    const bidEth = bidInput.value;
    if (!bidEth || parseFloat(bidEth) <= 0) return alert("Podaj kwotę oferty!");

    try {
        const bidWei = ethers.utils.parseEther(bidEth.toString());
        alert("Zaraz otworzy się okno MetaMask. Potwierdź w nim transakcję.");
        const tx = await auctionContract.placeBid(auctionId, { value: bidWei });
        console.log("Oferta złożona. Oczekuję na blok...");
        await tx.wait();
        alert("Sukces! Twoja oferta została przyjęta.");
        bidInput.value = "";
        fetchBlockchainState();
    } catch (error) {
        console.error("Błąd składania oferty:", error);
        alert("Transakcja odrzucona lub błąd. Sprawdź konsolę.");
    }
}

async function finalizeAuction() {
    if (!auctionContract) return alert("Połącz portfel!");
    try {
        alert("Zaraz otworzy się okno MetaMask. Potwierdź finalizację aukcji.");
        const tx = await auctionContract.finalizeEnglishAuction(auctionId);
        console.log("Finalizacja wysłana. Oczekuję na blok...");
        await tx.wait();
        alert("Aukcja zakończona i sfinalizowana!");
        fetchBlockchainState();
    } catch (error) {
        console.error("Błąd finalizacji:", error);
        alert("Transakcja odrzucona lub błąd. Sprawdź konsolę.");
    }
}

async function withdrawReturn() {
    if (!auctionContract) return alert("Połącz portfel!");
    try {
        alert("Zaraz otworzy się okno MetaMask. Potwierdź wypłatę środków.");
        const tx = await auctionContract.withdrawReturn(auctionId);
        console.log("Wypłata wysłana. Oczekuję na blok...");
        await tx.wait();
        alert("Środki zostały wypłacone na Twój portfel!");
        fetchBlockchainState();
    } catch (error) {
        console.error("Błąd wypłaty:", error);
        alert("Transakcja odrzucona lub błąd. Sprawdź konsolę.");
    }
}

// ============================================================
//  ODŚWIEŻANIE
// ============================================================

setInterval(() => {
    if (auctionContract) fetchBlockchainState();
}, 5000);

setTimeout(() => {
    if (auctionContract) fetchBlockchainState();
}, 1000);