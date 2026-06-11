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
    const debtWei = auc.debt;

    const btn100 = document.getElementById("bcBuyBtn");
    const btn50 = document.getElementById("bcBuy50Btn");

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
        const currentPriceWei = await auctionContract.getCurrentPrice(auctionId);
        document.getElementById("bc-price").innerText =
            `Obecna cena: ${ethers.utils.formatEther(currentPriceWei)} ETH\n(To jest Twoja aukcja)`;
        btn100.style.display = "none";
        btn50.style.display = "none";
    } else {
        const currentPriceWei = await auctionContract.getCurrentPrice(auctionId);
        document.getElementById("bc-price").innerText =
            `Obecna cena: ${ethers.utils.formatEther(currentPriceWei)} ETH`;
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

async function renderEnglishUI(auc) {
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

    if (highestBid.gt(0)) {
        bidInfo.innerText =
            `Najwyższa oferta: ${ethers.utils.formatEther(highestBid)} ETH` +
            ` | Lider: ${auc.highestBidder.substring(0, 6)}...` +
            `\n${timeStr}`;
    } else {
        bidInfo.innerText =
            `Brak ofert. Minimalna oferta: ${ethers.utils.formatEther(minBid)} ETH` +
            `\n${timeStr}`;
    }

    // Chowamy wszystko domyślnie, potem odkrywamy co trzeba
    bidInput.style.display = "none";
    bidBtn.style.display = "none";
    endBtn.style.display = "none";
    withdrawBtn.style.display = "none";

    if (isClosed) {
        const winnerText = auc.buyer !== ethers.constants.AddressZero
            ? `Wygrał: ${auc.buyer.substring(0, 6)}... za ${ethers.utils.formatEther(highestBid)} ETH`
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
