document.getElementById("form").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!auctionContract) {
        alert("Zaloguj się przez MetaMask, aby wystawić przedmiot na blockchainie!");
        return;
    }

    const title = document.getElementById("title").value;
    const priceEth = document.getElementById("price").value;
    const auctionType = document.getElementById("type").value; // "dutch" lub "english"

    if (priceEth <= 0) {
        alert("Cena musi być większa od 0");
        return;
    }

    try {
        const priceWei = ethers.utils.parseEther(priceEth.toString());
        // Czas trwania = 1 dzień
        const durationSeconds = 86400;

        alert("Potwierdź transakcję utworzenia aukcji w MetaMask...");

        let tx;

        if (auctionType === "dutch") {
            // Cena minimalna = połowa startowej
            const reservePriceWei = priceWei.div(2);
            tx = await auctionContract.createDutchAuction(
                title,
                priceWei,
                reservePriceWei,
                durationSeconds
            );
        } else {
            // Angielska: _minBid to minimalna pierwsza oferta
            tx = await auctionContract.createEnglishAuction(
                title,
                priceWei,
                durationSeconds
            );
        }

        console.log("Transakcja wysłana, czekamy na blok...");
        await tx.wait();

        alert("Sukces! Aukcja została na stałe zapisana na blockchainie.");
        window.location = "index.html";

    } catch (error) {
        console.error("Błąd tworzenia aukcji:", error);
        alert("Odrzucono transakcję w portfelu lub wystąpił błąd.");
    }
});
