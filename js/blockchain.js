// ZMIENIĆ PO KAŻDYM RESTARCIE BLOCKCHAINA
const AUCTION_CONTRACT_ADDRESS = "0xA2611330bB9cB90104B46faeA854d384C25a4c13";

const AUCTION_ABI = [
    // Tworzenie
    "function createDutchAuction(string _title, uint256 _startingPriceUsd, uint256 _reservePriceUsd, uint256 _duration) external",
    "function createEnglishAuction(string _title, uint256 _minBidUsd, uint256 _duration) external",

    // Odczyt
    "function auctionCounter() public view returns (uint256)",
    "function getAuction(uint256) external view returns (uint256 id, uint8 auctionType, address seller, string title, uint256 startingPrice, uint256 reservePrice, uint256 discountRate, uint256 minBid, uint256 highestBid, uint256 highestBidEth, address highestBidder, uint256 startAt, uint256 expiresAt, bool isClosed, address buyer, uint256 debtUsd, uint256 deadline5050, bool highestBidIs5050)",
    "function getCurrentPriceUsd(uint256 _id) public view returns (uint256)",
    "function getTimeLeft(uint256 _id) external view returns (uint256)",
    "function pendingReturns(uint256, address) public view returns (uint256)",

    // Przeliczniki walut
    "function getEthAmountForUsd(uint256 usdAmountWei) public view returns (uint256)",
    "function getUsdValue(uint256 ethAmountWei) public view returns (uint256)",

    // Aukcja holenderska
    "function buy(uint256 _id, bool is5050) external payable",
    "function payRemainingDebt(uint256 _id) external payable",
    "function liquidate(uint256 _id) external",

    // Aukcja angielska
    "function placeBid(uint256 _id, bool is5050) external payable",
    "function withdrawReturn(uint256 _id) external",
    "function finalizeEnglishAuction(uint256 _id) external",

    // Eventy
    "event BidPlaced(uint256 indexed id, address bidder, uint256 usdAmount, uint256 ethAmount)",
    "event AuctionFinalized(uint256 indexed id, address winner, uint256 ethAmountPaid)"
];

let provider;
let signer;
let auctionContract;

async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();

            const userAddress = await signer.getAddress();

            const connectBtn = document.getElementById("connectWalletBtn");
            if (connectBtn) {
                connectBtn.innerText = userAddress.substring(0, 6) + "...";
            }

            auctionContract = new ethers.Contract(AUCTION_CONTRACT_ADDRESS, AUCTION_ABI, signer);
            console.log("Web3 podłączone pomyślnie! Kontrakt gotowy do interakcji.");

        } catch (error) {
            console.error("Błąd połączenia z portfelem:", error);
        }
    } else {
        alert("Zainstaluj rozszerzenie MetaMask!");
    }
}

async function checkConnection() {
    if (typeof window.ethereum !== 'undefined') {
        const tempProvider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await tempProvider.listAccounts();
        if (accounts.length > 0) {
            console.log("Znaleziono aktywną sesję. Automatyczne łączenie w tle...");
            await connectWallet();
        }
    }
}

const connectBtn = document.getElementById("connectWalletBtn");
if (connectBtn) {
    connectBtn.addEventListener("click", connectWallet);
}

checkConnection();

if (window.ethereum) {
    window.ethereum.on('accountsChanged', function () {
        console.log("Konto zmienione, odświeżam stronę...");
        window.location.reload();
    });
}