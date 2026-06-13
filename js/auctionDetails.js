const urlParams = new URLSearchParams(window.location.search);
const auctionId = urlParams.get("id");

if (!auctionId) {
    document.body.innerHTML = "<h2>Nie podano ID aukcji w linku!</h2>";
}

// ============================================================
//  ODŚWIEŻANIE STANU
// ============================================================

async function fetchBlockchainState() {
    if (!auctionContract || !signer) return;

    try {
        const auc = await auctionContract.auctions(auctionId);
        const isEnglish = auc.auctionType === 1;

        document.getElementById("img").style.display = "none";
        document.getElementById("title").innerText = `${auc.title} (Aukcja #${auctionId})`;
        document.getElementById("desc").innerText = `Sprzedawca: ${auc.seller.substring(0, 6)}...`;

        if (isEnglish) {
            document.getElementById("dutch-ui").style.display = "none";
            document.getElementById("english-ui").style.display = "block";
            await renderEnglishUI(auc);
        } else {
            document.getElementById("dutch-ui").style.display = "block";
            document.getElementById("english-ui").style.display = "none";
            await renderDutchUI(auc);
        }
    } catch (error) {
        console.error("Błąd pobierania stanu z blockchaina:", error);
    }
}

// ============================================================
//  AUKCJA HOLENDERSKA
// ============================================================

async function renderDutchUI(auc) {
    const userAddress = await signer.getAddress();
    const isClosed = auc.isClosed;
    const sellerAddress = auc.seller;
    const buyerAddress = auc.buyer;
    const debtUsdWei = auc.debtUsd;

    const btn100 = document.getElementById("bcBuyBtn");
    const btn50 = document.getElementById("bcBuy50Btn");

    // Pobieramy cenę WYŁĄCZNIE W USD
    const currentPriceUsdWei = await auctionContract.getCurrentPriceUsd(auctionId);
    const usdValueDisplay = parseFloat(ethers.utils.formatEther(currentPriceUsdWei)).toFixed(2);
    
    let priceText = `Obecna cena: ${usdValueDisplay} USD`;

    if (isClosed) {
        document.getElementById("bc-price").innerText = "AUKCJA ZAKOŃCZONA (Przedmiot sprzedany)";
        btn100.style.display = "none";
        btn50.style.display = "none";

        if (userAddress.toLowerCase() === buyerAddress.toLowerCase() && debtUsdWei.gt(0)) {
            document.getElementById("bc-price").innerText +=
                `\nMasz dług do spłaty: ${parseFloat(ethers.utils.formatEther(debtUsdWei)).toFixed(2)} USD`;
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
        const currentPriceUsdWei = await auctionContract.getCurrentPriceUsd(auctionId);
        const requiredEthWei = await auctionContract.getEthAmountForUsd(currentPriceUsdWei);
        
        const amountToSendEthWei = is5050 ? requiredEthWei.div(2) : requiredEthWei;
        const amountWithBuffer = amountToSendEthWei.mul(103).div(100);

        alert(`Transakcja przygotowana! Otwieram MetaMask.\nWysłane zostanie ${ethers.utils.formatEther(amountWithBuffer).substring(0,6)} ETH (z wliczonym 3% buforem).`);
        
        const tx = await auctionContract.buy(auctionId, is5050, { 
            value: amountWithBuffer,
            gasLimit: 500000 
        });
        
        console.log("Transakcja zaakceptowana. Oczekuję na blok...");
        await tx.wait();
        alert("Sukces! Transakcja została sfinalizowana.");
        fetchBlockchainState();
    } catch (error) {
        console.error("Pełny błąd transakcji:", error);
        alert("Odrzucono transakcję. Sprawdź konsolę (F12) po więcej szczegółów.");
    }
}

async function payDebt() {
    if (!auctionContract) return alert("Połącz portfel!");
    try {
        const auc = await auctionContract.auctions(auctionId);
        const requiredEthWei = await auctionContract.getEthAmountForUsd(auc.debtUsd);
        const amountWithBuffer = requiredEthWei.mul(103).div(100);

        alert(`Otwieram MetaMask. Koszt spłaty to ok. ${ethers.utils.formatEther(amountWithBuffer).substring(0,6)} ETH.`);
        
        const tx = await auctionContract.payRemainingDebt(auctionId, { 
            value: amountWithBuffer,
            gasLimit: 500000 
        });
        
        console.log("Transakcja spłaty zaakceptowana. Oczekuję na blok...");
        await tx.wait();
        alert("Sukces! Dług został spłacony.");
        fetchBlockchainState();
    } catch (error) {
        console.error("Błąd spłaty:", error);
        alert("Transakcja spłaty została odrzucona.");
    }
}

// ============================================================
//  AUKCJA ANGIELSKA
// ============================================================

async function renderEnglishUI(auc) {
    const userAddress = (await signer.getAddress()).toLowerCase();
    const sellerAddress = auc.seller.toLowerCase();
    const isClosed = auc.isClosed;

    const highestBidUsd = auc.highestBid; // Wartość w USD!
    const highestBidder = auc.highestBidder.toLowerCase();
    const minBidUsd = auc.minBid; // Wartość w USD!
    const timeLeft = await auctionContract.getTimeLeft(auctionId);

    const bidInfo = document.getElementById("highest-bid-info");
    const bidInput = document.getElementById("bidAmount");
    const bidBtn = document.getElementById("bidBtn");
    const endBtn = document.getElementById("endAuctionBtn");
    const withdrawBtn = document.getElementById("withdrawBtn");

    bidInput.placeholder = "Twoja oferta (USD)";

    const minutes = Math.floor(timeLeft.toNumber() / 60);
    const seconds = timeLeft.toNumber() % 60;
    const timeStr = timeLeft.toNumber() > 0
        ? `Czas do końca: ${minutes}m ${seconds}s`
        : "Czas upłynął";

    if (highestBidUsd.gt(0)) {
        bidInfo.innerText =
            `Najwyższa oferta: ${parseFloat(ethers.utils.formatEther(highestBidUsd)).toFixed(2)} USD` +
            ` | Lider: ${auc.highestBidder.substring(0, 6)}...` +
            `\n${timeStr}`;
    } else {
        bidInfo.innerText =
            `Brak ofert. Minimalna oferta: ${parseFloat(ethers.utils.formatEther(minBidUsd)).toFixed(2)} USD` +
            `\n${timeStr}`;
    }

    bidInput.style.display = "none";
    bidBtn.style.display = "none";
    endBtn.style.display = "none";
    withdrawBtn.style.display = "none";

    if (isClosed) {
        const winnerText = auc.buyer !== ethers.constants.AddressZero
            ? `Wygrał: ${auc.buyer.substring(0, 6)}... za ${parseFloat(ethers.utils.formatEther(highestBidUsd)).toFixed(2)} USD`
            : "Nikt nie licytował — aukcja zakończona bez sprzedaży.";
        bidInfo.innerText = `AUKCJA ZAKOŃCZONA\n${winnerText}`;

        await showWithdrawIfNeeded(withdrawBtn);
        return;
    }

    if (userAddress === sellerAddress) {
        if (timeLeft.toNumber() === 0) {
            endBtn.style.display = "inline-block";
            endBtn.onclick = finalizeAuction;
        } else {
            bidInfo.innerText += "\n(To jest Twoja aukcja)";
        }
        return;
    }

    if (timeLeft.toNumber() === 0) {
        if (userAddress === highestBidder) {
            endBtn.style.display = "inline-block";
            endBtn.innerText = "Odbierz przedmiot (finalizuj)";
            endBtn.onclick = finalizeAuction;
        }
        await showWithdrawIfNeeded(withdrawBtn);
        return;
    }

    bidInput.style.display = "inline-block";
    bidBtn.style.display = "inline-block";
    bidBtn.onclick = placeBid;

    const minRequired = highestBidUsd.gt(0)
        ? ethers.utils.formatEther(highestBidUsd.add(ethers.utils.parseEther("1"))) // Minimalne przebicie o 1 USD
        : ethers.utils.formatEther(minBidUsd);
    
    bidInput.placeholder = `Min. oferta: ${minRequired} USD`;

    await showWithdrawIfNeeded(withdrawBtn);
}

async function showWithdrawIfNeeded(withdrawBtn) {
    try {
        const userAddress = await signer.getAddress();

        const pendingEth = await auctionContract.pendingReturns(auctionId, userAddress);
        if (pendingEth.gt(0)) {
            withdrawBtn.style.display = "inline-block";
            withdrawBtn.innerText = `Odbierz zwrócone ETH: ${ethers.utils.formatEther(pendingEth).substring(0,6)}`;
            withdrawBtn.onclick = withdrawReturn;
        }
    } catch (e) {
        console.error("Błąd sprawdzania zwrotu:", e);
    }
}

async function placeBid() {
    if (!auctionContract) return alert("Połącz portfel!");
    const bidInput = document.getElementById("bidAmount");
    const bidUsd = bidInput.value;
    if (!bidUsd || parseFloat(bidUsd) <= 0) return alert("Podaj kwotę oferty w USD!");

    try {
        const bidUsdWei = ethers.utils.parseEther(bidUsd.toString());
        const requiredEthWei = await auctionContract.getEthAmountForUsd(bidUsdWei);
        const amountWithBuffer = requiredEthWei.mul(103).div(100);

        alert(`Otwieram MetaMask. Wysłane zostanie ok. ${ethers.utils.formatEther(amountWithBuffer).substring(0,6)} ETH.`);
        
        const tx = await auctionContract.placeBid(auctionId, { 
            value: amountWithBuffer,
            gasLimit: 500000 
        });
        
        console.log("Oferta złożona. Oczekuję na blok...");
        await tx.wait();
        alert("Sukces! Twoja oferta została przyjęta.");
        bidInput.value = "";
        fetchBlockchainState();
    } catch (error) {
        console.error("Błąd składania oferty:", error);
        alert("Transakcja odrzucona. Upewnij się, że przebiłeś lidera.");
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
        alert("Zaraz otworzy się okno MetaMask. Potwierdź wypłatę zwróconych ETH.");
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