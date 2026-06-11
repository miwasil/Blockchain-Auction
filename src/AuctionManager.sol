// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AuctionManager is ReentrancyGuard {

    // Typ aukcji
    enum AuctionType { Dutch, English }

    struct Auction {
        uint256 id;
        AuctionType auctionType;
        address payable seller;
        string title;

        // --- Pola Holenderskiej ---
        uint256 startingPrice;
        uint256 reservePrice;
        uint256 discountRate;

        // --- Pola Angielskiej ---
        uint256 minBid;         // Minimalna kwota pierwszej oferty
        uint256 highestBid;     // Aktualna najwyższa oferta
        address payable highestBidder; // Adres lidera

        // --- Wspólne ---
        uint256 startAt;
        uint256 expiresAt;
        bool isClosed;
        address buyer;      // Finalny kupujący (Dutch 50/50 lub English po zakończeniu)
        uint256 debt;       // Dług w trybie 50/50 (tylko Dutch)
        uint256 deadline5050;
    }

    mapping(uint256 => Auction) public auctions;
    // Mapa: auctionId => bidder => kwota zablokowana (English)
    mapping(uint256 => mapping(address => uint256)) public pendingReturns;

    uint256 public auctionCounter;

    // Eventy do nasłuchiwania po stronie frontendu
    event AuctionCreated(uint256 indexed id, AuctionType auctionType, address seller);
    event BidPlaced(uint256 indexed id, address bidder, uint256 amount);
    event AuctionFinalized(uint256 indexed id, address winner, uint256 amount);

    error AuctionNotFound();
    error AuctionClosed();
    error TimeExpired();
    error AuctionStillActive();
    error NotBuyer();
    error NotSeller();
    error WrongAuctionType();

    // =========================================================
    //  TWORZENIE AUKCJI
    // =========================================================

    /// @notice Tworzy aukcję holenderską (cena spada w czasie)
    function createDutchAuction(
        string memory _title,
        uint256 _startingPrice,
        uint256 _reservePrice,
        uint256 _duration
    ) external {
        require(_startingPrice > _reservePrice, "Cena poczatkowa musi byc wieksza od minimalnej");
        require(_duration > 0, "Czas trwania musi byc wiekszy od 0");

        auctionCounter++;
        uint256 newId = auctionCounter;

        auctions[newId] = Auction({
            id: newId,
            auctionType: AuctionType.Dutch,
            seller: payable(msg.sender),
            title: _title,
            startingPrice: _startingPrice,
            reservePrice: _reservePrice,
            discountRate: (_startingPrice - _reservePrice) / _duration,
            minBid: 0,
            highestBid: 0,
            highestBidder: payable(address(0)),
            startAt: block.timestamp,
            expiresAt: block.timestamp + _duration,
            isClosed: false,
            buyer: address(0),
            debt: 0,
            deadline5050: 0
        });

        emit AuctionCreated(newId, AuctionType.Dutch, msg.sender);
    }

    /// @notice Tworzy aukcję angielską (cena rośnie, wygrywa najwyższa oferta)
    function createEnglishAuction(
        string memory _title,
        uint256 _minBid,
        uint256 _duration
    ) external {
        require(_minBid > 0, "Minimalna oferta musi byc wieksza od 0");
        require(_duration > 0, "Czas trwania musi byc wiekszy od 0");

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
            minBid: _minBid,
            highestBid: 0,
            highestBidder: payable(address(0)),
            startAt: block.timestamp,
            expiresAt: block.timestamp + _duration,
            isClosed: false,
            buyer: address(0),
            debt: 0,
            deadline5050: 0
        });

        emit AuctionCreated(newId, AuctionType.English, msg.sender);
    }

    // =========================================================
    //  AUKCJA HOLENDERSKA
    // =========================================================

    /// @notice Zwraca obecną (spadającą) cenę aukcji holenderskiej
    function getCurrentPrice(uint256 _id) public view returns (uint256) {
        if (_id == 0 || _id > auctionCounter) revert AuctionNotFound();

        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.Dutch) revert WrongAuctionType();
        if (block.timestamp >= auc.expiresAt) return auc.reservePrice;

        uint256 timeElapsed = block.timestamp - auc.startAt;
        uint256 discount = auc.discountRate * timeElapsed;
        return auc.startingPrice - discount;
    }

    /// @notice Kupno w aukcji holenderskiej (100% lub 50/50)
    function buy(uint256 _id, bool is5050) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.Dutch) revert WrongAuctionType();
        if (auc.isClosed) revert AuctionClosed();
        if (block.timestamp > auc.expiresAt) revert TimeExpired();

        uint256 currentPrice = getCurrentPrice(_id);

        if (!is5050) {
            require(msg.value >= currentPrice, "Za malo ETH");
            auc.isClosed = true;
            auc.buyer = msg.sender;

            (bool success, ) = auc.seller.call{value: msg.value}("");
            require(success, "Transfer nie powiodl sie");
        } else {
            uint256 requiredDownPayment = currentPrice / 2;
            require(msg.value >= requiredDownPayment, "Za malo ETH na zaliczke");

            auc.isClosed = true;
            auc.buyer = msg.sender;
            auc.debt = currentPrice - msg.value;
            auc.deadline5050 = block.timestamp + 7 days;

            (bool success, ) = auc.seller.call{value: msg.value}("");
            require(success, "Transfer nie powiodl sie");
        }

        emit AuctionFinalized(_id, msg.sender, msg.value);
    }

    /// @notice Spłata reszty długu (tryb 50/50, aukcja holenderska)
    function payRemainingDebt(uint256 _id) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (msg.sender != auc.buyer) revert NotBuyer();
        require(block.timestamp <= auc.deadline5050, "Czas na splate minal");
        require(msg.value >= auc.debt, "Za malo ETH na splate dlugu");

        auc.debt = 0;

        (bool success, ) = auc.seller.call{value: msg.value}("");
        require(success, "Transfer nie powiodl sie");
    }

    /// @notice Likwidacja dłużnika po upływie terminu 50/50
    function liquidate(uint256 _id) external nonReentrant {
        Auction storage auc = auctions[_id];
        if (msg.sender != auc.seller) revert NotSeller();
        require(auc.buyer != address(0), "To nie jest transakcja 50/50");
        require(block.timestamp > auc.deadline5050, "Czas na splate jeszcze nie minal");
        require(auc.debt > 0, "Dlug jest juz splacony");

        auc.debt = 0;
        auc.buyer = address(0);
    }

    // =========================================================
    //  AUKCJA ANGIELSKA
    // =========================================================

    /// @notice Złożenie oferty w aukcji angielskiej
    /// Poprzedni lider od razu dostaje swoje ETH z powrotem do odebrania.
    function placeBid(uint256 _id) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.English) revert WrongAuctionType();
        if (auc.isClosed) revert AuctionClosed();
        if (block.timestamp > auc.expiresAt) revert TimeExpired();
        require(msg.sender != auc.seller, "Sprzedawca nie moze licytowac");

        // Pierwsza oferta musi przekroczyć minBid; kolejne muszą bić dotychczasowe highestBid
        uint256 minRequired = auc.highestBid == 0 ? auc.minBid : auc.highestBid + 1;
        require(msg.value >= minRequired, "Oferta musi byc wyzsza niz aktualna");

        // Zwracamy ETH poprzedniemu liderowi (pull pattern)
        if (auc.highestBidder != address(0)) {
            pendingReturns[_id][auc.highestBidder] += auc.highestBid;
        }

        auc.highestBid = msg.value;
        auc.highestBidder = payable(msg.sender);

        emit BidPlaced(_id, msg.sender, msg.value);
    }

    /// @notice Wypłata zwróconych środków (dla przebytych licytantów)
    function withdrawReturn(uint256 _id) external nonReentrant {
        uint256 amount = pendingReturns[_id][msg.sender];
        require(amount > 0, "Brak srodkow do wyplaty");

        pendingReturns[_id][msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Wyplata nie powiodla sie");
    }

    /// @notice Finalizacja aukcji angielskiej po upływie czasu
    /// Może wywołać sprzedawca LUB wygrywający licytant.
    function finalizeEnglishAuction(uint256 _id) external nonReentrant {
        Auction storage auc = auctions[_id];
        if (auc.auctionType != AuctionType.English) revert WrongAuctionType();
        if (auc.isClosed) revert AuctionClosed();
        if (block.timestamp <= auc.expiresAt) revert AuctionStillActive();
        require(
            msg.sender == auc.seller || msg.sender == auc.highestBidder,
            "Tylko sprzedawca lub zwyciezca moze finalizowac"
        );

        auc.isClosed = true;
        auc.buyer = auc.highestBidder;

        if (auc.highestBidder != address(0)) {
            // Przekazujemy wygraną kwotę sprzedawcy
            (bool success, ) = auc.seller.call{value: auc.highestBid}("");
            require(success, "Transfer do sprzedawcy nie powiodl sie");
            emit AuctionFinalized(_id, auc.highestBidder, auc.highestBid);
        }
        // Jeśli nikt nie licytował — aukcja zamknięta bez sprzedaży
    }

    // =========================================================
    //  WIDOKI POMOCNICZE
    // =========================================================

    /// @notice Zwraca czas pozostały do końca aukcji (w sekundach), 0 jeśli po czasie
    function getTimeLeft(uint256 _id) external view returns (uint256) {
        Auction storage auc = auctions[_id];
        if (block.timestamp >= auc.expiresAt) return 0;
        return auc.expiresAt - block.timestamp;
    }
}
