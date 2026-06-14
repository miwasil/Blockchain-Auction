Aby odpalić test uruchom `forge test --fork-url https://eth-mainnet.g.alchemy.com/v2/TWÓJ_KLUCZ -v`

test 1 **(tworzenie aukcji)** - createEnglishAuction zapisuje poprawne dane (id, typ, sprzedawca, minBid, isClosed=false).  To test bazowy — jeśli kontrakt w ogóle nie zapisuje danych poprawnie, wszystkie inne testy też by padły.

test 2 **(minimalna różnica ofert)** - oferta równa najwyższej jest odrzucana (minUsdRequired = highestBid + 1 USD). Porównujemy ETH do ETH a nie USD do USD - po to żeby uniknąć sytuacji, gdzie zaokrąglenia przy konwersji dawały tę samą wartość USD

test 3 **(tryb 50/50)** - licytacja 50/50 przyjmuje tylko połowę ETH, zapisuje highestBidIs5050=true, i przy przebijaniu natychmiast zwraca ETH poprzedniemu liderowi

test 4 **(wygasanie aukcji)** - Sprawdzamy możliwośc dodania oferty po zakończeniu aukcji (getAuction zwraca isClosed=true po skip(61), a placeBid revertuje z TimeExpired)


## Wyniki testów

![Wyniki testów](testy.png)
