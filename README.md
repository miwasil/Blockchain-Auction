# Aukcje Blockchain

Platforma Web3 umożliwiająca tworzenie i licytowanie przedmiotów w modelach **Aukcji Holenderskiej** oraz **Aukcji Klasycznej (Angielskiej)**. Projekt został zbudowany z wykorzystaniem **HTML/CSS/JS** po stronie frontendu oraz frameworka **Foundry** do tworzenia i wdrażania smart kontraktów.

---

## Wymagania wstępne

Przed uruchomieniem projektu lokalnie upewnij się, że masz zainstalowane:

* **Foundry** (w tym narzędzia `forge` oraz `anvil`)
* **MetaMask** (rozszerzenie do przeglądarki internetowej)
* **Live Server** dla Visual Studio Code

---

# Instrukcja uruchomienia

## Krok 1: Uruchomienie lokalnego blockchaina

Otwórz terminal w głównym folderze projektu i uruchom:

```bash
anvil
```

Nie zamykaj tego terminala — działa on jako lokalny serwer blockchain.

Narzędzie **Anvil** wygeneruje listę **10 kont testowych**, z których każde zostanie zasilone kwotą **10 000 testowych ETH**.

Pozostaw okno otwarte, ponieważ będzie potrzebny dostęp do wygenerowanych kluczy prywatnych.

---

## Krok 2: Wdrożenie smart kontraktów

Otwórz drugie okno terminala w tym samym folderze projektu i wykonaj:

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

Po poprawnym wdrożeniu:

1. Przejrzyj logi w terminalu.
2. Znajdź wartość oznaczoną jako:

```text
Contract Address
```

3. Skopiuj adres wdrożonego kontraktu, np.:

```text
0x5FbDB2315678afecb367f032d93F642f64180aa3
```

---

## Krok 3: Połączenie frontendu z kontraktem

Otwórz plik:

```text
js/blockchain.js
```

W pierwszej linijce zaktualizuj adres kontraktu:

```javascript
const AUCTION_CONTRACT_ADDRESS = "TUTAJ_WKLEJ_SWÓJ_ADRES";
```

Zapisz plik.

---

## Krok 4: Konfiguracja portfela MetaMask

Otwórz rozszerzenie **MetaMask**.

### Dodanie lokalnej sieci

Przejdź do:

**Wybór sieci → Dodaj sieć ręcznie**

Uzupełnij pola:

| Pole               | Wartość                 |
| ------------------ | ----------------------- |
| Nazwa sieci        | `Localhost 8545`        |
| Nowy adres URL RPC | `http://127.0.0.1:8545` |
| Chain ID           | `31337`                 |
| Symbol waluty      | `ETH`                   |

### Import kont testowych

1. Kliknij ikonę profilu.
2. Wybierz **Importuj konto**.
3. Skopiuj **Private Key** wygenerowany przez Anvil.
4. Wklej klucz w odpowiednie pole.

Rekomendowane jest zaimportowanie **minimum dwóch kont**, np.:

* Konto Sprzedawcy
* Konto Kupującego

Pozwoli to zasymulować rzeczywiste transakcje między użytkownikami.

---

## Krok 5: Uruchomienie serwera dla frontendu

Jeśli korzystasz z **Visual Studio Code**, użyj rozszerzenia **Live Server**.

---

## Krok 6: Testowanie aplikacji

Otwórz przeglądarkę i przejdź pod adres:

```text
http://localhost:5500
```

Aplikacja jest gotowa do działania.

Możesz teraz:

* połączyć się za pomocą MetaMask,
* tworzyć nowe aukcje,
* przełączać konta użytkowników,
* testować proces licytacji,
* sprawdzać mechanizm płatności odroczonych (**50% teraz i 50% do 7 dni**).

Wszystkie dane oraz operacje będą zapisywane bezpośrednio na lokalnym blockchainie.

---

## Technologie

* HTML
* Vanilla JavaScript
* Solidity
* Foundry
* Anvil
* MetaMask
* Web3
