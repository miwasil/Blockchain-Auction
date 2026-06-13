// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// =========================================================
//  INTERFEJS CHAINLINK
// =========================================================
interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

contract AuctionManager is ReentrancyGuard {

    // Adres wyroczni cenowej Chainlink ETH/USD na Ethereum Mainnet
    AggregatorV3Interface internal priceFeed = AggregatorV3Interface(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);

    enum AuctionType { Dutch, English }

    struct Auction {
        uint256 id;
        AuctionType auctionType;
        address payable seller;
        string title;

        // --- Pola Holenderskiej (CENY W USD WEI) ---
        uint256 startingPrice; 
        uint256 reservePrice;  
        uint256 discountRate;  

        // --- Pola Angielskiej (CENY W USD WEI) ---
        uint256 minBid;         
        uint256 highestBid;     // najwyzsza
        uint256 highestBidEth;  // ile ETH wplacil lider
        address payable highestBidder; 

        uint256 startAt;
        uint256 expiresAt;
        bool isClosed;
        address buyer;      
        uint256 debtUsd;  
        uint256 deadline5050;
    }

    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => uint256)) public pendingReturns; // Zawsze w ETH

    uint256 public auctionCounter;

    event AuctionCreated(uint256 indexed id, AuctionType auctionType, address seller);
    event BidPlaced(uint256 indexed id, address bidder, uint256 usdAmount, uint256 ethAmount);
    event AuctionFinalized(uint256 indexed id, address winner, uint256 ethAmountPaid);

    error AuctionNotFound();
    error AuctionClosed();
    error TimeExpired();
    error AuctionStillActive();
    error NotBuyer();
    error NotSeller();
    error WrongAuctionType();

    // =========================================================
    //  POMOCNICZE: PRZELICZANIE WALUT (CHAINLINK)
    // =========================================================

    /// @notice Pobiera obecną cenę 1 ETH w USD (z 8 miejscami po przecinku)
    function getLatestEthPrice() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return uint256(price);
    }

    /// @notice Zmienia podaną kwotę ETH (Wei) na jej równowartość w USD (Wei, 18 miejsc)
    function getUsdValue(uint256 ethAmountWei) public view returns (uint256) {
        uint256 ethPrice = getLatestEthPrice();
        return (ethAmountWei * ethPrice) / 1e8;
    }

    /// @notice Zmienia wymaganą kwotę USD (Wei, 18 miejsc) na potrzebną ilość ETH (Wei)
    function getEthAmountForUsd(uint256 usdAmountWei) public view returns (uint256) {
        uint256 ethPrice = getLatestEthPrice();
        return (usdAmountWei * 1e8) / ethPrice;
    }

    // =========================================================
    //  TWORZENIE AUKCJI
    // =========================================================

    function createDutchAuction(
        string memory _title,
        uint256 _startingPriceUsd,
        uint256 _reservePriceUsd,
        uint256 _duration
    ) external {
        require(_startingPriceUsd > _reservePriceUsd, "Cena poczatkowa musi byc wieksza");
        require(_duration > 0, "Czas musi byc wiekszy od 0");

        auctionCounter++;
        uint256 newId = auctionCounter;

        auctions[newId] = Auction({
            id: newId,
            auctionType: AuctionType.Dutch,
            seller: payable(msg.sender),
            title: _title,
            startingPrice: _startingPriceUsd,
            reservePrice: _reservePriceUsd,
            discountRate: (_startingPriceUsd - _reservePriceUsd) / _duration,
            minBid: 0,
            highestBid: 0,
            highestBidEth: 0,
            highestBidder: payable(address(0)),
            startAt: block.timestamp,
            expiresAt: block.timestamp + _duration,
            isClosed: false,
            buyer: address(0),
            debtUsd: 0,
            deadline5050: 0
        });

        emit AuctionCreated(newId, AuctionType.Dutch, msg.sender);
    }

    function createEnglishAuction(
        string memory _title,
        uint256 _minBidUsd,
        uint256 _duration
    ) external {
        require(_minBidUsd > 0, "Min oferta musi byc > 0");
        require(_duration > 0, "Czas musi byc > 0");

        auctionCounter++;
        uint256 newId = auctionCounter;

        auctions[newId] = Auction({
            id: newId,
            auctionType: AuctionType.English,
            seller: payable(msg.sender),
            title: _title,
            startingPrice: 0,
            reservePrice: 0,
            discountRate: 0,
            minBid: _minBidUsd,
            highestBid: 0,
            highestBidEth: 0,
            highestBidder: payable(address(0)),
            startAt: block.timestamp,
            expiresAt: block.timestamp + _duration,
            isClosed: false,
            buyer: address(0),
            debtUsd: 0,
            deadline5050: 0
        });

        emit AuctionCreated(newId, AuctionType.English, msg.sender);
    }

    // =========================================================
    //  AUKCJA HOLENDERSKA
    // =========================================================

    /// @notice Zwraca obecną (spadającą) cenę aukcji holenderskiej W DOLARACH (USD Wei)
    function getCurrentPriceUsd(uint256 _id) public view returns (uint256) {
        if (_id == 0 || _id > auctionCounter) revert AuctionNotFound();

        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.Dutch) revert WrongAuctionType();
        if (block.timestamp >= auc.expiresAt) return auc.reservePrice;

        uint256 timeElapsed = block.timestamp - auc.startAt;
        uint256 discount = auc.discountRate * timeElapsed;
        return auc.startingPrice - discount;
    }

    function buy(uint256 _id, bool is5050) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.Dutch) revert WrongAuctionType();
        if (auc.isClosed) revert AuctionClosed();
        if (block.timestamp > auc.expiresAt) revert TimeExpired();

        // Pobieramy cenę w USD i sprawdzamy, ile ETH musi wysłać użytkownik
        uint256 currentPriceUsd = getCurrentPriceUsd(_id);
        uint256 requiredEth = getEthAmountForUsd(currentPriceUsd);

        if (!is5050) {
            require(msg.value >= requiredEth, "Zbyt malo ETH wzgledem kursu USD");
            auc.isClosed = true;
            auc.buyer = msg.sender;

            (bool success, ) = auc.seller.call{value: msg.value}("");
            require(success, "Transfer ETH fail");
        } else {
            uint256 requiredDownPaymentEth = requiredEth / 2;
            require(msg.value >= requiredDownPaymentEth, "Zbyt malo ETH na zaliczke USD");

            auc.isClosed = true;
            auc.buyer = msg.sender;
            // Zapisujemy dług w USD (Odejmujemy od pełnej ceny USD to, co dostaliśmy w ETH przeliczone na USD)
            auc.debtUsd = currentPriceUsd - getUsdValue(msg.value); 
            auc.deadline5050 = block.timestamp + 7 days;

            (bool success, ) = auc.seller.call{value: msg.value}("");
            require(success, "Transfer ETH fail");
        }

        emit AuctionFinalized(_id, msg.sender, msg.value);
    }

    function payRemainingDebt(uint256 _id) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (msg.sender != auc.buyer) revert NotBuyer();
        require(block.timestamp <= auc.deadline5050, "Czas na splate minal");
        
        // Wyliczamy, ile ETH trzeba dziś zapłacić za ten dług w USD
        uint256 requiredEth = getEthAmountForUsd(auc.debtUsd);
        require(msg.value >= requiredEth, "Zbyt malo ETH by pokryc reszte dlugu w USD");

        auc.debtUsd = 0;

        (bool success, ) = auc.seller.call{value: msg.value}("");
        require(success, "Transfer fail");
    }

    function liquidate(uint256 _id) external nonReentrant {
        Auction storage auc = auctions[_id];
        if (msg.sender != auc.seller) revert NotSeller();
        require(auc.buyer != address(0), "To nie jest transakcja 50/50");
        require(block.timestamp > auc.deadline5050, "Czas na splate minal");
        require(auc.debtUsd > 0, "Dlug w USD zostal splacony");

        auc.debtUsd = 0;
        auc.buyer = address(0);
    }

    // =========================================================
    //  AUKCJA ANGIELSKA
    // =========================================================

    function placeBid(uint256 _id) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.English) revert WrongAuctionType();
        if (auc.isClosed) revert AuctionClosed();
        if (block.timestamp > auc.expiresAt) revert TimeExpired();
        require(msg.sender != auc.seller, "Sprzedawca nie licytuje");

        // Przeliczamy ile USD warte jest wpłacone ETH
        uint256 sentUsdValue = getUsdValue(msg.value);
        uint256 minUsdRequired = auc.highestBid == 0 ? auc.minBid : auc.highestBid;
        
        require(sentUsdValue > minUsdRequired, "Oferta w USD zbyt niska!");

        // Zwracamy ETH (pull pattern) poprzedniemu liderowi
        if (auc.highestBidder != address(0)) {
            pendingReturns[_id][auc.highestBidder] += auc.highestBidEth;
        }

        auc.highestBid = sentUsdValue;
        auc.highestBidEth = msg.value; // Zapisujemy twarde ETH do ewentualnego zwrotu
        auc.highestBidder = payable(msg.sender);

        emit BidPlaced(_id, msg.sender, sentUsdValue, msg.value);
    }

    function withdrawReturn(uint256 _id) external nonReentrant {
        uint256 amount = pendingReturns[_id][msg.sender];
        require(amount > 0, "Brak srodkow do wyplaty");

        pendingReturns[_id][msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Wyplata fail");
    }

    function finalizeEnglishAuction(uint256 _id) external nonReentrant {
        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.English) revert WrongAuctionType();
        if (auc.isClosed) revert AuctionClosed();
        if (block.timestamp <= auc.expiresAt) revert AuctionStillActive();
        require(
            msg.sender == auc.seller || msg.sender == auc.highestBidder,
            "Tylko sprzedawca lub zwyciezca"
        );

        auc.isClosed = true;
        auc.buyer = auc.highestBidder;

        if (auc.highestBidder != address(0)) {
            // Przekazujemy wygraną kwotę ETH (tę którą fizycznie zablokował lider) sprzedawcy
            (bool success, ) = auc.seller.call{value: auc.highestBidEth}("");
            require(success, "Transfer do sprzedawcy fail");
            emit AuctionFinalized(_id, auc.highestBidder, auc.highestBidEth);
        }
    }

    // =========================================================
    //  WIDOKI POMOCNICZE
    // =========================================================

    function getTimeLeft(uint256 _id) external view returns (uint256) {
        Auction storage auc = auctions[_id];
        if (block.timestamp >= auc.expiresAt) return 0;
        return auc.expiresAt - block.timestamp;
    }
}