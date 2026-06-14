// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Uruchom: forge test --fork-url <MAINNET_RPC_URL> -v

import {Test, console} from "forge-std/Test.sol";
import {AuctionManager} from "../src/AuctionManager.sol";

interface IChainlink {
    function latestRoundData() external view returns (
        uint80, int256 answer, uint256, uint256, uint80
    );
}

// Pomocniczy struct żeby uniknąć tuple destructuring (błędy kompilatora)
struct AucData {
    uint256 id;
    uint8 auctionType;
    address seller;
    string title;
    uint256 startingPrice;
    uint256 reservePrice;
    uint256 discountRate;
    uint256 minBid;
    uint256 highestBid;
    uint256 highestBidEth;
    address highestBidder;
    uint256 startAt;
    uint256 expiresAt;
    bool isClosed;
    address buyer;
    uint256 debtUsd;
    uint256 deadline5050;
    bool highestBidIs5050;
}

contract AuctionManagerTest is Test {
    AuctionManager public mgr;

    address constant CHAINLINK = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

    address seller  = makeAddr("seller");
    address bidder1 = makeAddr("bidder1");
    address bidder2 = makeAddr("bidder2");

    function getAuction(uint256 id) internal view returns (AucData memory a) {
        (
            a.id, a.auctionType, a.seller, a.title,
            a.startingPrice, a.reservePrice, a.discountRate,
            a.minBid, a.highestBid, a.highestBidEth, a.highestBidder,
            a.startAt, a.expiresAt, a.isClosed,
            a.buyer, a.debtUsd, a.deadline5050, a.highestBidIs5050
        ) = mgr.getAuction(id);
    }

    function ethForUsd(uint256 usdWei) internal view returns (uint256) {
        (, int256 price,,,) = IChainlink(CHAINLINK).latestRoundData();
        return (usdWei * 1e8) / uint256(price);
    }

    function setUp() public {
        mgr = new AuctionManager();
        vm.deal(seller,  100 ether);
        vm.deal(bidder1, 100 ether);
        vm.deal(bidder2, 100 ether);
    }

    // ================================================================
    //  TEST 1: Tworzenie aukcji angielskiej
    // ================================================================
    function test_CreateEnglishAuction() public {
        uint256 minBid   = 100 ether;
        uint256 duration = 3600;

        vm.prank(seller);
        mgr.createEnglishAuction("Laptop", minBid, duration);

        AucData memory a = getAuction(1);
        assertEq(a.id,          1,        "id powinno byc 1");
        assertEq(a.auctionType, 1,        "typ: 1 = English");
        assertEq(a.seller,      seller,   "zly sprzedawca");
        assertEq(a.title,       "Laptop", "zly tytul");
        assertEq(a.minBid,      minBid,   "zla minimalna oferta");
        assertEq(a.highestBid,  0,        "highestBid powinno byc 0");
        assertFalse(a.isClosed,           "aukcja powinna byc aktywna");
    }

    // ================================================================
    //  TEST 2: Oferta za tę samą kwotę jest odrzucana (min. +1 USD)
    // ================================================================
    function test_BidMustBeHigherByAtLeast1Usd() public {
        vm.prank(seller);
        mgr.createEnglishAuction("Gitara", 100 ether, 3600);

        uint256 eth200 = ethForUsd(200 ether);
        vm.prank(bidder1);
        mgr.placeBid{value: eth200 * 103 / 100}(1, false);

        // Ta sama kwota ETH — powinna być odrzucona
        vm.prank(bidder2);
        vm.expectRevert("Oferta w USD zbyt niska!");
        mgr.placeBid{value: eth200 * 103 / 100}(1, false);
    }

    // ================================================================
    //  TEST 3: Tryb 50/50 — wpłata połowy i natychmiastowy zwrot
    // ================================================================
    function test_Bid5050_HalfPaymentAndInstantRefund() public {
        vm.prank(seller);
        mgr.createEnglishAuction("Rower", 100 ether, 3600);

        uint256 eth200full = ethForUsd(200 ether);
        uint256 eth200half = eth200full / 2;

        vm.prank(bidder1);
        mgr.placeBid{value: eth200half * 103 / 100}(1, true);

        AucData memory a = getAuction(1);
        assertEq(a.highestBidder,   bidder1, "bidder1 powinien byc liderem");
        assertTrue(a.highestBidIs5050,       "tryb powinien byc 50/50");
        assertLt(a.highestBidEth, eth200full, "escrow powinno byc < pelnej kwoty");

        // bidder2 przebija — bidder1 dostaje natychmiastowy zwrot
        uint256 balanceBefore = bidder1.balance;

        uint256 eth300 = ethForUsd(300 ether);
        vm.prank(bidder2);
        mgr.placeBid{value: eth300 * 103 / 100}(1, false);

        assertGt(bidder1.balance, balanceBefore, "bidder1 powinien dostac zwrot ETH");
    }

    // ================================================================
    //  TEST 4: getAuction zwraca isClosed=true po upływie czasu
    // ================================================================
    function test_AuctionClosedAfterExpiry() public {
        vm.prank(seller);
        mgr.createEnglishAuction("Zegarek", 50 ether, 60);

        assertFalse(getAuction(1).isClosed, "przed uplywem powinna byc aktywna");

        skip(61);

        assertTrue(getAuction(1).isClosed, "po uplywie powinna byc zamknieta");

        // Nie można licytować po czasie
        uint256 eth = ethForUsd(100 ether);
        vm.prank(bidder1);
        vm.expectRevert(AuctionManager.TimeExpired.selector);
        mgr.placeBid{value: eth}(1, false);
    }
}
