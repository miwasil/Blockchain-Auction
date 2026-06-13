const list = document.getElementById("list");

async function renderAuctions() {
    if (!auctionContract) {
        list.innerHTML = "<p>Pobieranie danych z blockchaina... (Jeśli trwa to długo, kliknij 'Połącz MetaMask')</p>";
        return;
    }

    try {
        const totalCounter = await auctionContract.auctionCounter();
        const total = totalCounter.toNumber();

        if (total === 0) {
            list.innerHTML = "<p>Brak aukcji na blockchainie.</p>";
            return;
        }

        list.innerHTML = "";

        for (let i = 1; i <= total; i++) {
            const auc = await auctionContract.auctions(i);

            const id = auc.id.toNumber();
            const title = auc.title;
            const isClosed = auc.isClosed;
            // auctionType: 0 = Dutch, 1 = English
            const isEnglish = auc.auctionType === 1;

            const statusHTML = isClosed
                ? "<b style='color:red'>Zakończona</b>"
                : "<b style='color:green'>Aktywna</b>";

            let priceHTML = "";
            let typeLabel = "";

            if (isEnglish) {
                typeLabel = "Aukcja Klasyczna (English)";
                const highestBid = auc.highestBid;
                if (highestBid.gt(0)) {
                    priceHTML = `Najwyższa oferta: ${ethers.utils.formatEther(highestBid)} USD`;
                } else {
                    priceHTML = `Min. oferta: ${ethers.utils.formatEther(auc.minBid)} USD`;
                }
            } else {
                typeLabel = "Aukcja Holenderska (Dutch)";
                const startingPriceUsd = ethers.utils.formatEther(auc.startingPrice);
                priceHTML = `Cena startowa: ${startingPriceUsd} USD`;
            }

            list.innerHTML += `
            <div class="card">
              <div class="no-image">Brak obrazu</div>
              <h3>${title} (ID: ${id})</h3>
              <p>Typ: ${typeLabel}</p>
              <p>${priceHTML}</p>
              <p>Status: ${statusHTML}</p>
              <a href="auction-details.html?id=${id}">
                <button class="btn">Szczegóły / ${isEnglish ? 'Licytuj' : 'Kup'}</button>
              </a>
            </div>`;
        }
    } catch (err) {
        console.error("Błąd podczas pobierania listy aukcji:", err);
        list.innerHTML = "<p>Wystąpił błąd podczas łączenia z siecią. Sprawdź konsolę (F12).</p>";
    }
}

const interval = setInterval(() => {
    if (auctionContract) {
        clearInterval(interval);
        renderAuctions();
    }
}, 500);
