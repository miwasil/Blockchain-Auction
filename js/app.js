const list = document.getElementById("list");

function render(){
  list.innerHTML = "";

  if(!auctions || auctions.length === 0){
    list.innerHTML = "<p>Brak aukcji</p>";
    return;
  }

  auctions.forEach(a=>{
    list.innerHTML += `
    <div class="card">
      ${
        a.image
            ? `<img src="${a.image}" class="auction-img">`
            : `<div class="no-image">Brak zdjęcia</div>`
    }

      <h3>${a.title}</h3>
      <p>${a.type}</p>
      <p>${a.price} ${a.currency}</p>

      <a href="auction-details.html?id=${a.id}">
        <button class="btn">Szczegóły</button>
      </a>
    </div>`;
  });
}

render();