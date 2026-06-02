let auctions = JSON.parse(localStorage.getItem("auctions")) || [];

function save(){
  localStorage.setItem("auctions", JSON.stringify(auctions));
}