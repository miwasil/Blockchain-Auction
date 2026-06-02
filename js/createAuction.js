document.getElementById("form").addEventListener("submit", e=>{
  e.preventDefault();

  const file = document.getElementById("image").files[0];

  const title = document.getElementById("title").value;
  const desc = document.getElementById("desc").value;
  const type = document.getElementById("type").value;
  const currency = document.getElementById("currency").value;
  const payment = document.getElementById("payment").value;
  const price = Number(document.getElementById("price").value);

  if(price <= 0){
    alert("Cena musi być większa od 0");
    return;
  }

  function createAuction(imageBase64){

    const auction = {
      id: Date.now(),
      title,
      description: desc,
      type,
      price,
      currency,
      payment,
      image: imageBase64 || "",
      owner: "local-user",
      bids: []
    };

    auctions.push(auction);
    save();

    window.location = "index.html";
  }

  if(file){
    const reader = new FileReader();

    reader.onload = function(){
      createAuction(reader.result);
    };

    reader.readAsDataURL(file);
  } else {
    createAuction(null);
  }
});