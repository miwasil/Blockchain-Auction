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
        const auc = await auctionContract.getAuction(auctionId);
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
        const auc = await auctionContract.getAuction(auctionId);
        const requiredEthWei = await auctionContract.getEthAmountForUsd(auc.debtUsd);

        const escrowEth = auc.highestBidEth;
        const fromEscrow = escrowEth.gte(requiredEthWei) ? requiredEthWei : escrowEth;
        const fromMsg = requiredEthWei.sub(fromEscrow);
        const amountWithBuffer = fromMsg.gt(0) ? fromMsg.mul(103).div(100) : ethers.constants.Zero;

        const ethLabel = amountWithBuffer.gt(0)
            ? ethers.utils.formatEther(amountWithBuffer).substring(0, 6)
            : "0 (pokryte z escrow)";

        alert(`Otwieram MetaMask. Koszt spłaty to ok. ${ethLabel} ETH.`);

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
    const buyerAddress = auc.buyer;
    const debtUsdWei = auc.debtUsd;

    const highestBidUsd = auc.highestBid;
    const highestBidder = auc.highestBidder.toLowerCase();
    const minBidUsd = auc.minBid;
    const timeLeft = await auctionContract.getTimeLeft(auctionId);

    const bidInfo = document.getElementById("highest-bid-info");
    const bidInput = document.getElementById("bidAmount");
    const bidBtn = document.getElementById("bidBtn");
    const endBtn = document.getElementById("endAuctionBtn");
    const end50Btn = document.getElementById("endAuction50Btn");
    const payDebtBtn = document.getElementById("payDebtBtn");
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
    end50Btn.style.display = "none";
    payDebtBtn.style.display = "none";
    withdrawBtn.style.display = "none";

    if (isClosed) {
        const winnerText = auc.highestBidder !== ethers.constants.AddressZero
            ? `Wygrał: ${auc.highestBidder.substring(0, 6)}... za ${parseFloat(ethers.utils.formatEther(highestBidUsd)).toFixed(2)} USD`
            : "Nikt nie licytował — aukcja zakończona bez sprzedaży.";
        bidInfo.innerText = `AUKCJA ZAKOŃCZONA\n${winnerText}`;

        if (userAddress === buyerAddress.toLowerCase() && debtUsdWei.gt(0)) {
            bidInfo.innerText +=
                `\nMasz dług do spłaty: ${parseFloat(ethers.utils.formatEther(debtUsdWei)).toFixed(2)} USD`;
            payDebtBtn.style.display = "inline-block";
            payDebtBtn.onclick = payDebt;
        }

        await showWithdrawIfNeeded(withdrawBtn);
        return;
    }

    if (userAddress === sellerAddress) {
        if (timeLeft.toNumber() === 0) {
            endBtn.style.display = "inline-block";
            endBtn.innerText = "Zakończ aukcję";
            endBtn.onclick = () => finalizeAuction(false);
        } else {
            bidInfo.innerText += "\n(To jest Twoja aukcja)";
        }
        return;
    }

    if (timeLeft.toNumber() === 0) {

        if (highestBidUsd.gt(0)) {

            bidInfo.innerText =
                `🏆 Aukcja zakończona\n` +
                `Lider: ${auc.highestBidder.substring(0,6)}...\n` +
                `Oferta: ${parseFloat(
                    ethers.utils.formatEther(highestBidUsd)
                ).toFixed(2)} USD`;

            endBtn.style.display = "inline-block";
            endBtn.innerText = "Rozlicz aukcję";
            endBtn.onclick = finalizeAuction;

        } else {

            bidInfo.innerText =
                "Aukcja zakończona bez ofert.";

            // brak przycisku
            endBtn.style.display = "none";
        }

        await showWithdrawIfNeeded(withdrawBtn);
        return;
    }

    // Minimalna oferta = highestBid + 1 USD (dokładnie tak jak w kontrakcie)
    // Przeliczamy przez ETH żeby uniknąć błędów zaokrąglenia — tak samo jak kontrakt
    const minUsdWei = highestBidUsd.gt(0)
        ? highestBidUsd.add(ethers.utils.parseEther("1"))
        : minBidUsd;
    const minEthWei = await auctionContract.getEthAmountForUsd(minUsdWei);
    // Wyświetlamy użytkownikowi kwotę w USD (zaokrągloną w górę do 2 miejsc)
    const minRequired = parseFloat(ethers.utils.formatEther(minUsdWei)).toFixed(2);

    if (userAddress === highestBidder) {
        // Lider nie może licytować — pokazujemy info o jego trybie
        const modeLabel = auc.highestBidIs5050
            ? "50/50 — wpłaciłeś połowę, reszta należna po wygranej"
            : "100% — wpłaciłeś całość";
        bidInfo.innerText += `\n\n🏅 Jesteś liderem (tryb: ${modeLabel}).\nCzekaj aż ktoś Cię przebije.`;
    } else {
        bidInput.placeholder = `Min. oferta: ${minRequired} USD`;
        bidInput.style.display = "inline-block";

        // Dwa przyciski — wybór trybu płatności przy składaniu oferty
        bidBtn.style.display = "inline-block";
        bidBtn.innerText = "Licytuj (100% teraz)";
        bidBtn.onclick = () => placeBid(false);

        end50Btn.style.display = "inline-block";
        end50Btn.innerText = "Licytuj na raty (50% teraz + 50% po wygranej w 7 dni)";
        end50Btn.style.backgroundColor = "#17a2b8";
        end50Btn.onclick = () => placeBid(true);

        bidInfo.innerText += `\n\n💡 Licytuj na raty — wpłacasz teraz tylko połowę oferty; jeśli wygrasz, masz 7 dni na resztę. Jeśli przegrasz, dostajesz z powrotem to co wpłaciłeś.`;
    }

    await showWithdrawIfNeeded(withdrawBtn);
}

async function showWithdrawIfNeeded(withdrawBtn) {
    try {
        const userAddress = await signer.getAddress();

        const pendingEth = await auctionContract.pendingReturns(auctionId, userAddress);
        if (pendingEth.gt(0)) {
            withdrawBtn.style.display = "inline-block";
            withdrawBtn.innerText = `Odbierz ETH: ${ethers.utils.formatEther(pendingEth).substring(0,6)}`;
            withdrawBtn.onclick = withdrawReturn;
        }
    } catch (e) {
        console.error("Błąd sprawdzania zwrotu:", e);
    }
}

async function placeBid(is5050) {
    if (!auctionContract) return alert("Połącz portfel!");
    const bidInput = document.getElementById("bidAmount");
    const bidUsd = bidInput.value;
    if (!bidUsd || parseFloat(bidUsd) <= 0) return alert("Podaj kwotę oferty w USD!");

    try {
        const bidUsdWei = ethers.utils.parseEther(bidUsd.toString());

        // Walidacja po stronie frontendu — ta sama logika co w kontrakcie:
        // przeliczamy minimalną ofertę na ETH i porównujemy ETH do ETH
        const auc = await auctionContract.getAuction(auctionId);
        const minUsdWei = auc.highestBid.gt(0)
            ? auc.highestBid.add(ethers.utils.parseEther("1"))
            : auc.minBid;
        const minEthWei = await auctionContract.getEthAmountForUsd(minUsdWei);

        const fullEthWei = await auctionContract.getEthAmountForUsd(bidUsdWei);
        const effectiveEth = is5050 ? fullEthWei.div(2).mul(2) : fullEthWei; // rekonstrukcja jak w kontrakcie

        if (fullEthWei.lt(minEthWei)) {
            const minUsd = parseFloat(ethers.utils.formatEther(minUsdWei)).toFixed(2);
            return alert(`Oferta za niska! Minimalna kwota to ${minUsd} USD.`);
        }

        const ethToSend = is5050 ? fullEthWei.div(2) : fullEthWei;
        const amountWithBuffer = ethToSend.mul(103).div(100);

        const modeLabel = is5050 ? "50/50 — wpłacasz teraz połowę" : "100% — wpłacasz całość";
        const ethLabel = ethers.utils.formatEther(amountWithBuffer).substring(0, 6);
        alert(`Tryb: ${modeLabel}\nOtwieram MetaMask. Wysłane zostanie ok. ${ethLabel} ETH.`);

        const tx = await auctionContract.placeBid(auctionId, is5050, {
            value: amountWithBuffer,
            gasLimit: 500000
        });

        console.log("Oferta złożona. Oczekuję na blok...");
        await tx.wait();
        alert(is5050
            ? "Oferta przyjęta! Jeśli wygrasz, będziesz mieć 7 dni na wpłatę pozostałej połowy."
            : "Oferta przyjęta!");
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
        const auc = await auctionContract.getAuction(auctionId);
        const modeLabel = auc.highestBidIs5050 ? "50/50 (wpłaciłeś połowę, reszta w 7 dni)" : "100%";
        alert(
            `Rozliczenie aukcji.\n` +
            `Tryb płatności: ${modeLabel}.`
        );
        const tx = await auctionContract.finalizeEnglishAuction(auctionId, { gasLimit: 500000 });
        console.log("Finalizacja wysłana. Oczekuję na blok...");
        await tx.wait();
        alert(auc.highestBidIs5050
            ? "Aukcja zakończona! Masz 7 dni na spłatę pozostałej połowy."
            : "Aukcja zakończona i sfinalizowana!");
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