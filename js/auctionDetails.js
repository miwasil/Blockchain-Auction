const id = new URLSearchParams(window.location.search).get("id");
const a = auctions.find(x => x.id == id);

if(!a){
  document.body.innerHTML = "<h2>Nie znaleziono aukcji</h2>";
  throw new Error("Auction not found");
}

a.bids = a.bids || [];

document.getElementById("img").src = a.image || "";
document.getElementById("title").innerText = a.title;
document.getElementById("desc").innerText = a.description;
document.getElementById("price").innerText = a.price + " " + a.currency;

function render(){
  const b = document.getElementById("bids");
  b.innerHTML = "";

  const highest = a.bids.length
      ? Math.max(...a.bids.map(b => b.amount))
      : Number(a.price);

  b.innerHTML += `<p><b>Aktualna najwyższa oferta:</b> ${highest} ${a.currency}</p>`;

  a.bids.forEach(x=>{
    b.innerHTML += `<p>${x.amount} ${a.currency}</p>`;
  });
}

document.getElementById("bidBtn").onclick = () => {
  const val = Number(document.getElementById("bid").value);

  if(!val || val <= 0){
    alert("Oferta musi być większa od 0");
    return;
  }

  const highestBid = a.bids.length
      ? Math.max(...a.bids.map(b => b.amount))
      : Number(a.price);

  if(val <= highestBid){
    alert("Oferta musi być wyższa niż aktualna najwyższa oferta");
    return;
  }

  a.bids.push({ amount: val });

  save();
  render();
};

render();