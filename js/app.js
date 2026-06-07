const list = document.getElementById("list");

async function renderAuctions() {
    // Sprawdzamy, czy użytkownik jest połączony
    if (!auctionContract) {
        list.innerHTML = "<p>Pobieranie danych z blockchaina... (Jeśli trwa to długo, kliknij 'Połącz MetaMask')</p>";
        return;
    }

    try {
        // Pytamy blockchain, ile łącznie wygenerowano aukcji
        const totalCounter = await auctionContract.auctionCounter();
        const total = totalCounter.toNumber();

        if (total === 0) {
            list.innerHTML = "<p>Brak aukcji na blockchainie.</p>";
            return;
        }

        list.innerHTML = ""; // Czyścimy listę "Pobieranie..."

        // Pętla pobierająca każdą aukcję po kolei
        for (let i = 1; i <= total; i++) {
            const auc = await auctionContract.auctions(i);
            
            const id = auc.id.toNumber();
            const title = auc.title;
            const startingPriceEth = ethers.utils.formatEther(auc.startingPrice);
            const isClosed = auc.isClosed;

            const statusHTML = isClosed 
                ? "<b style='color:red'>Zakończona / Sprzedane</b>" 
                : "<b style='color:green'>Aktywna (Cena spada)</b>";

            list.innerHTML += `
            <div class="card">
              <div class="no-image">Brak obrazu</div>
              <h3>${title} (ID: ${id})</h3>
              <p>Typ: Aukcja Holenderska</p>
              <p>Cena startowa: ${startingPriceEth} ETH</p>
              <p>Status: ${statusHTML}</p>
              
              <a href="auction-details.html?id=${id}">
                <button class="btn">Szczegóły / Kup</button>
              </a>
            </div>`;
        }
    } catch (err) {
        console.error("Błąd podczas pobierania list aukcji:", err);
        list.innerHTML = "<p>Wystąpił błąd podczas łączenia z siecią. Sprawdź konsolę (F12).</p>";
    }
}

// Czekamy chwilę, aż plik blockchain.js połączy się z MetaMaskiem, po czym ładujemy listę
const interval = setInterval(() => {
    if (auctionContract) {
        clearInterval(interval);
        renderAuctions();
    }
}, 500);