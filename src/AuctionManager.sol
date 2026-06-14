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
        bool highestBidIs5050;
    }

    mapping(uint256 => Auction) internal auctions;
    mapping(uint256 => mapping(address => uint256)) public pendingReturns; // Zawsze w ETH

    function getAuction(uint256 _id) external view returns (
        uint256 id,
        uint8 auctionType,
        address seller,
        string memory title,
        uint256 startingPrice,
        uint256 reservePrice,
        uint256 discountRate,
        uint256 minBid,
        uint256 highestBid,
        uint256 highestBidEth,
        address highestBidder,
        uint256 startAt,
        uint256 expiresAt,
        bool isClosed,
        address buyer,
        uint256 debtUsd,
        uint256 deadline5050,
        bool highestBidIs5050
    ) {
        Auction storage auc = auctions[_id];

        bool effectivelyClosed =
            auc.isClosed ||
            (
                auc.highestBidder == address(0) &&
                block.timestamp > auc.expiresAt
            );

        return (
            auc.id,
            uint8(auc.auctionType),
            address(auc.seller),
            auc.title,
            auc.startingPrice,
            auc.reservePrice,
            auc.discountRate,
            auc.minBid,
            auc.highestBid,
            auc.highestBidEth,
            address(auc.highestBidder),
            auc.startAt,
            auc.expiresAt,
            effectivelyClosed,
            address(auc.buyer),
            auc.debtUsd,
            auc.deadline5050,
            auc.highestBidIs5050
        );
    }

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

        Auction storage auc = auctions[newId];
        auc.id = newId;
        auc.auctionType = AuctionType.Dutch;
        auc.seller = payable(msg.sender);
        auc.title = _title;
        auc.startingPrice = _startingPriceUsd;
        auc.reservePrice = _reservePriceUsd;
        auc.discountRate = (_startingPriceUsd - _reservePriceUsd) / _duration;
        auc.startAt = block.timestamp;
        auc.expiresAt = block.timestamp + _duration;

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

        Auction storage auc = auctions[newId];
        auc.id = newId;
        auc.auctionType = AuctionType.English;
        auc.seller = payable(msg.sender);
        auc.title = _title;
        auc.minBid = _minBidUsd;
        auc.startAt = block.timestamp;
        auc.expiresAt = block.timestamp + _duration;

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

        uint256 requiredEth = getEthAmountForUsd(auc.debtUsd);
        uint256 fromEscrow = 0;

        if (auc.auctionType == AuctionType.English && auc.highestBidEth > 0) {
            fromEscrow = auc.highestBidEth >= requiredEth ? requiredEth : auc.highestBidEth;
            auc.highestBidEth -= fromEscrow;
        }

        uint256 fromMsg = requiredEth - fromEscrow;
        require(msg.value >= fromMsg, "Zbyt malo ETH by pokryc reszte dlugu w USD");

        auc.debtUsd = 0;

        (bool success, ) = auc.seller.call{value: fromEscrow + fromMsg}("");
        require(success, "Transfer fail");
    }

    function liquidate(uint256 _id) external nonReentrant {
        Auction storage auc = auctions[_id];
        if (msg.sender != auc.seller) revert NotSeller();
        require(auc.buyer != address(0), "To nie jest transakcja 50/50");
        require(block.timestamp > auc.deadline5050, "Czas na splate minal");
        require(auc.debtUsd > 0, "Dlug w USD zostal splacony");

        if (auc.auctionType == AuctionType.English && auc.highestBidEth > 0) {
            (bool success, ) = auc.seller.call{value: auc.highestBidEth}("");
            require(success, "Transfer escrow fail");
            auc.highestBidEth = 0;
        }

        auc.debtUsd = 0;
        auc.buyer = address(0);
    }

    // =========================================================
    //  AUKCJA ANGIELSKA
    // =========================================================

    // Licytujący deklaruje tryb płatności przy składaniu oferty:
    // is5050=false -> wpłaca 100% oferty do escrow
    // is5050=true  -> wpłaca 50% oferty do escrow; resztę płaci po wygraniu (7 dni)
    // Lider NIE może podbijać własnej oferty — musi poczekać aż ktoś go przebije.
    // Gdy lider jest przebijany, jego ETH jest mu natychmiast zwracane (bez pendingReturns).

    function placeBid(uint256 _id, bool is5050) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.English) revert WrongAuctionType();
        if (auc.isClosed) revert AuctionClosed();
        if (block.timestamp > auc.expiresAt) revert TimeExpired();
        require(msg.sender != auc.seller, "Sprzedawca nie licytuje");
        require(msg.sender != auc.highestBidder, "Jestes liderem - czekaj az ktos Cie przebije");

        // Minimalna oferta = obecna najwyzsza + 1 USD, przeliczona na ETH.
        // Porownujemy ETH do ETH zeby uniknac bledow zaokraglenia przy konwersji USD<->ETH.
        // Przy 50/50 msg.value to polowa pelnej kwoty, wiec rowniez minEth dzielimy przez 2.
        uint256 minUsdRequired = auc.highestBid == 0 ? auc.minBid : auc.highestBid + 1 ether;
        uint256 minEthRequired = getEthAmountForUsd(minUsdRequired);
        uint256 effectiveEth   = is5050 ? msg.value * 2 : msg.value;

        require(effectiveEth >= minEthRequired, "Oferta w USD zbyt niska!");

        // Zapisujemy wartosc oferty w USD na podstawie pelnej kwoty ETH
        uint256 sentUsdValue = is5050 ? getUsdValue(msg.value) * 2 : getUsdValue(msg.value);

        // Zwrot poprzedniemu liderowi — natychmiastowy transfer (bez pendingReturns)
        if (auc.highestBidder != address(0)) {
            address payable prevBidder = auc.highestBidder;
            uint256 refundAmount = auc.highestBidEth;
            auc.highestBidEth = 0;
            auc.highestBidder = payable(address(0));
            (bool refunded, ) = prevBidder.call{value: refundAmount}("");
            require(refunded, "Zwrot poprzedniemu liderowi fail");
        }

        auc.highestBid = sentUsdValue;
        auc.highestBidEth = msg.value;
        auc.highestBidder = payable(msg.sender);
        auc.highestBidIs5050 = is5050;

        emit BidPlaced(_id, msg.sender, sentUsdValue, msg.value);
    }

    // Pozostawione dla kompatybilnosci — po zmianie logiki pendingReturns nie sa uzywane
    // przy licytacji, ale moga byc niezerowe z poprzednich wersji kontraktu
    function withdrawReturn(uint256 _id) external nonReentrant {
        uint256 amount = pendingReturns[_id][msg.sender];
        require(amount > 0, "Brak srodkow do wyplaty");
        pendingReturns[_id][msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Wyplata fail");
    }

    // Finalizacja: tryb 50/50 jest juz ustalony z momentu licytacji (highestBidIs5050).
    // Sprzedawca lub zwyciezca moze wywolac finalizacje — tryb sie nie zmienia.
    function finalizeEnglishAuction(uint256 _id) external nonReentrant {
        Auction storage auc = auctions[_id];

        if (auc.auctionType != AuctionType.English)
            revert WrongAuctionType();

        if (auc.isClosed)
            revert AuctionClosed();

        if (block.timestamp <= auc.expiresAt)
            revert AuctionStillActive();

        auc.isClosed = true;
        auc.buyer = auc.highestBidder;

        if (auc.highestBidder == address(0)) {
            return;
        }

        uint256 escrowEth = auc.highestBidEth;
        auc.highestBidEth = 0;

        if (!auc.highestBidIs5050) {

            (bool success,) =
                                    auc.seller.call{value: escrowEth}("");

            require(success, "Transfer do sprzedawcy fail");

            emit AuctionFinalized(
                _id,
                auc.buyer,
                escrowEth
            );

        } else {

            uint256 fullUsd = auc.highestBid;
            uint256 paidUsd = getUsdValue(escrowEth);

            auc.debtUsd = fullUsd - paidUsd;
            auc.deadline5050 = block.timestamp + 7 days;

            (bool success,) =
                                    auc.seller.call{value: escrowEth}("");

            require(success, "Transfer do sprzedawcy fail");

            emit AuctionFinalized(
                _id,
                auc.buyer,
                escrowEth
            );
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