// ZMIENIĆ PO KAŻDYM RESTARCIE BLOCKCHAINA
const AUCTION_CONTRACT_ADDRESS = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

const AUCTION_ABI = [
    "function createAuction(string _title, uint256 _startingPrice, uint256 _reservePrice, uint256 _duration) external",
    "function auctionCounter() public view returns (uint256)",
    "function auctions(uint256) public view returns (uint256 id, address seller, string title, uint256 startingPrice, uint256 reservePrice, uint256 discountRate, uint256 startAt, uint256 expiresAt, bool isClosed, address buyer, uint256 debt, uint256 deadline5050)",
    "function getCurrentPrice(uint256 _id) public view returns (uint256)",
    "function buy(uint256 _id, bool is5050) external payable",
    "function payRemainingDebt(uint256 _id) external payable"
];

let provider;
let signer;
let auctionContract;

async function connectWallet() {
    // czy użytkownik ma rozszerzenie?
    if (typeof window.ethereum !== 'undefined') {
        try {
            // Połączenie z MetaMaskiem
            provider = new ethers.providers.Web3Provider(window.ethereum);
            
            // Prosimy MetaMaska o autoryzację i dostęp do portfela
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            
            // Pobieramy adres użytkownika
            const userAddress = await signer.getAddress();
            
            // Aktualizujemy tekst na przycisku (jeśli przycisk istnieje na danej stronie)
            const connectBtn = document.getElementById("connectWalletBtn");
            if (connectBtn) {
                connectBtn.innerText = userAddress.substring(0, 6) + "...";
            }
            
            // Inicjalizacja kontraktu (podpięcie pod adres i ABI)
            auctionContract = new ethers.Contract(AUCTION_CONTRACT_ADDRESS, AUCTION_ABI, signer);
            console.log("Web3 podłączone pomyślnie! Kontrakt gotowy do interakcji.");
            
            // Jeśli jesteśmy na stronie szczegółów, wymuś pierwsze pobranie ceny od razu po zalogowaniu
            if (typeof fetchBlockchainPrice === "function" && window.location.pathname.includes("auction-details.html")) {
                fetchBlockchainPrice();
            }
            
        } catch (error) {
            console.error("Błąd połączenia z portfelem:", error);
        }
    } else {
        alert("Zainstaluj rozszerzenie MetaMask!");
    }
}

// Odzyskuje połączenie po zmianie podstrony
async function checkConnection() {
    if (typeof window.ethereum !== 'undefined') {
        // Tymczasowy provider tylko do sprawdzenia, czy portfel jest już odblokowany dla tej witryny
        const tempProvider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await tempProvider.listAccounts();
        
        if (accounts.length > 0) {
            console.log("Znaleziono aktywną sesję. Automatyczne łączenie w tle...");
            // Odzyskujemy pełne połączenie (tworzymy globalny signer i auctionContract)
            await connectWallet(); 
        }
    }
}

// Podpięcie eventu pod przycisk logowania (jeśli przycisk istnieje na stronie)
const connectBtn = document.getElementById("connectWalletBtn");
if (connectBtn) {
    connectBtn.addEventListener("click", connectWallet);
}

// Uruchamiamy sprawdzanie połączenia przy każdym załadowaniu strony
checkConnection();

// Nasłuchiwanie na zmianę konta w MetaMasku
if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accounts) {
        console.log("Konto zmienione, odświeżam stronę...");
        window.location.reload();
    });
}