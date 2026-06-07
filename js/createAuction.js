document.getElementById("form").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!auctionContract) {
        alert("Zaloguj się przez MetaMask, aby wystawić przedmiot na blockchainie!");
        return;
    }

    const title = document.getElementById("title").value;
    const priceEth = document.getElementById("price").value;

    if (priceEth <= 0) {
        alert("Cena musi być większa od 0");
        return;
    }

    try {
        // ETH -> Wei (18 zer) dla kontraktu
        const startingPriceWei = ethers.utils.parseEther(priceEth.toString());
        
        // Parametry: 
        // Cena minimalna = połowa startowej
        // Czas trwania = 1 dzień (86400 sekund)
        const reservePriceWei = startingPriceWei.div(2); 
        const durationSeconds = 86400;

        alert("Potwierdź transakcję utworzenia aukcji w MetaMask...");
        
        const tx = await auctionContract.createAuction(
            title, 
            startingPriceWei, 
            reservePriceWei, 
            durationSeconds
        );

        console.log("Transakcja wysłana, czekamy na blok...");
        await tx.wait(); // sleep aż zapisze dane

        alert("Sukces! Aukcja została na stałe zapisana na blockchainie.");
        window.location = "index.html"; // Powrót

    } catch (error) {
        console.error("Błąd tworzenia aukcji:", error);
        alert("Odrzucono transakcję w portfelu lub wystąpił błąd.");
    }
});