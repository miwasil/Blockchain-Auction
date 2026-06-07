// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DutchAuctionManager is ReentrancyGuard {
    
    // Struktura przechowująca wszystkie dane pojedynczej aukcji
    struct Auction {
        uint256 id;
        address payable seller;
        string title;
        uint256 startingPrice;
        uint256 reservePrice;
        uint256 discountRate;
        uint256 startAt;
        uint256 expiresAt;
        bool isClosed;
        address buyer;
        uint256 debt;
        uint256 deadline5050;
    }

    // "Baza danych" aukcji na blockchainie
    mapping(uint256 => Auction) public auctions;
    uint256 public auctionCounter; // Licznik wszystkich aukcji

    error AuctionNotFound();
    error AuctionClosed();
    error TimeExpired();
    error NotBuyer();
    error NotSeller();

    /// @notice Tworzy nową aukcję i zapisuje ją na blockchainie
    function createAuction(
        string memory _title,
        uint256 _startingPrice,
        uint256 _reservePrice,
        uint256 _duration
    ) external {
        require(_startingPrice > _reservePrice, "Cena poczatkowa musi byc wieksza");
        
        auctionCounter++; // Zwiększamy ID (np. z 0 na 1)
        uint256 newId = auctionCounter;

        auctions[newId] = Auction({
            id: newId,
            seller: payable(msg.sender), // Twórca staje się sprzedawcą
            title: _title,
            startingPrice: _startingPrice,
            reservePrice: _reservePrice,
            discountRate: (_startingPrice - _reservePrice) / _duration,
            startAt: block.timestamp,
            expiresAt: block.timestamp + _duration,
            isClosed: false,
            buyer: address(0),
            debt: 0,
            deadline5050: 0
        });
    }

    /// @notice Zwraca obecną cenę konkretnej aukcji
    function getCurrentPrice(uint256 _id) public view returns (uint256) {
        if (_id == 0 || _id > auctionCounter) revert AuctionNotFound();
        
        Auction storage auc = auctions[_id];
        if (block.timestamp >= auc.expiresAt) return auc.reservePrice;
        
        uint256 timeElapsed = block.timestamp - auc.startAt;
        uint256 discount = auc.discountRate * timeElapsed;
        return auc.startingPrice - discount;
    }

    /// @notice Kupno z wyborem trybu płatności (100% lub 50/50)
    function buy(uint256 _id, bool is5050) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (auc.isClosed) revert AuctionClosed();
        if (block.timestamp > auc.expiresAt) revert TimeExpired();

        uint256 currentPrice = getCurrentPrice(_id);

        if (!is5050) {
            require(msg.value >= currentPrice, "Za malo ETH");
            auc.isClosed = true;
            
            (bool success, ) = auc.seller.call{value: msg.value}("");
            require(success, "Transfer failed");
        } else {
            uint256 requiredDownPayment = currentPrice / 2;
            require(msg.value >= requiredDownPayment, "Za malo ETH na zaliczke");
            
            auc.isClosed = true;
            auc.buyer = msg.sender; // Zapisujemy dłużnika
            auc.debt = currentPrice - msg.value;
            auc.deadline5050 = block.timestamp + 7 days;

            (bool success, ) = auc.seller.call{value: msg.value}("");
            require(success, "Transfer failed");
        }
    }

    function payRemainingDebt(uint256 _id) external payable nonReentrant {
        Auction storage auc = auctions[_id];
        if (msg.sender != auc.buyer) revert NotBuyer();
        require(block.timestamp <= auc.deadline5050, "Czas minal");
        require(msg.value >= auc.debt, "Za malo na splate dlugu");

        auc.debt = 0;
        
        (bool success, ) = auc.seller.call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    /// @notice Pozwala sprzedawcy anulować transakcję i zatrzymać zaliczkę, jeśli dłużnik spóźnia się ze spłatą
    function liquidate(uint256 _id) external nonReentrant {
        Auction storage auc = auctions[_id];
        
        if (msg.sender != auc.seller) revert NotSeller();
        require(auc.buyer != address(0), "To nie jest transakcja 50/50");
        require(block.timestamp > auc.deadline5050, "Czas na splate jeszcze nie minal");
        require(auc.debt > 0, "Dlug jest juz splacony");

        // Likwidacja dłużnika: 
        // 1. Zaliczka, którą wpłacił wcześniej, już jest bezpieczna na portfelu sprzedawcy.
        // 2. Zerujemy dług i wykreślamy go jako kupującego.
        // 3. Sprzedawca z powrotem jest pełnoprawnym właścicielem przedmiotu.
        auc.debt = 0;
        auc.buyer = address(0);
    }
}