(function(){
  const STORAGE_KEY = 'ja-cart-v1';
  const WA_MULTIPLAZA = '595974702574';
  const WA_SAN_LORENZO = '595974702576';
  const WA_NUMBER = WA_MULTIPLAZA; // default for product modals
  const fmt = n => new Intl.NumberFormat('es-PY').format(n);

  // ============ STATE ============
  function load(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch(_) { return []; }
  }
  function save(items){ localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
  let cart = load();

  // ============ INJECT STYLES ============
  const css = `
  :root{--ja-gold:#c9a24b;--ja-gold-l:#f3dca0;--ja-gold-d:#9c7a36;--ja-dark:#100d09;--ja-text:#efe9dd;--ja-mute:#8b8578;}
  .ja-fab{position:fixed;right:22px;bottom:22px;z-index:150;display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#f3dca0,#c9a24b 55%,#a17e38);color:#0c0a06;border:0;cursor:pointer;box-shadow:0 18px 40px -14px rgba(201,162,75,.8),0 4px 12px rgba(0,0,0,.5);transition:transform .3s ease;font-family:inherit;}
  .ja-fab:hover{transform:translateY(-2px) scale(1.05);}
  .ja-fab .ja-fab-badge{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#0c0a06;color:#f3dca0;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;border:1px solid #c9a24b;font-family:'Jost',sans-serif;}
  .ja-fab .ja-fab-badge.hide{display:none;}
  @media(max-width:560px){.ja-fab{width:54px;height:54px;right:16px;bottom:16px;}}

  .ja-back{position:fixed;inset:0;background:rgba(8,7,5,0.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:200;display:none;opacity:0;transition:opacity .35s ease;}
  .ja-back.open{display:block;opacity:1;}

  .ja-drawer{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:92vw;background:#0c0a08;border-left:1px solid rgba(201,162,75,.2);z-index:210;transform:translateX(100%);transition:transform .45s cubic-bezier(.22,.61,.36,1);display:flex;flex-direction:column;color:var(--ja-text);font-family:'Jost',sans-serif;font-weight:300;}
  .ja-drawer.open{transform:translateX(0);box-shadow:-30px 0 80px -20px rgba(0,0,0,.85);}
  .ja-drawer .ja-hd{display:flex;align-items:center;justify-content:space-between;padding:22px 24px 16px;border-bottom:1px solid rgba(201,162,75,.12);}
  .ja-drawer .ja-hd h3{margin:0;font-family:'CommercialScript',cursive;font-weight:400;font-size:32px;line-height:1;color:#f4eee2;padding-bottom:.2em;}
  .ja-drawer .ja-hd .ja-close{background:none;border:0;color:#cfc8ba;cursor:pointer;padding:6px;border-radius:50%;transition:background .3s ease,color .3s ease;}
  .ja-drawer .ja-hd .ja-close:hover{background:rgba(201,162,75,.12);color:#f3dca0;}
  .ja-drawer .ja-items{flex:1;overflow-y:auto;padding:14px 24px 12px;}
  .ja-drawer .ja-items::-webkit-scrollbar{width:6px;}
  .ja-drawer .ja-items::-webkit-scrollbar-thumb{background:#3a3120;border-radius:6px;}
  .ja-empty{padding:60px 20px;text-align:center;color:#7d7768;}
  .ja-empty .icc{display:inline-flex;width:54px;height:54px;align-items:center;justify-content:center;border:1px solid rgba(201,162,75,.25);border-radius:50%;margin-bottom:14px;color:#c9a24b;}
  .ja-empty h4{margin:0;font-family:'Cormorant Garamond',serif;font-size:22px;color:#cfc8ba;font-weight:500;}
  .ja-empty p{margin:6px 0 18px;font-size:13.5px;line-height:1.55;}
  .ja-empty .ja-cont{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:999px;font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;color:#0c0a06;background:linear-gradient(120deg,#f3dca0,#c9a24b 55%,#a17e38);border:0;cursor:pointer;font-family:inherit;}

  .ja-item{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid rgba(201,162,75,.08);}
  .ja-item:last-child{border-bottom:0;}
  .ja-item .thumb{width:74px;height:74px;border-radius:14px;background:#161208;overflow:hidden;flex-shrink:0;border:1px solid rgba(201,162,75,.12);}
  .ja-item .thumb img{width:100%;height:100%;object-fit:cover;display:block;}
  .ja-item .info{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;}
  .ja-item .info .nm{font-family:'Cormorant Garamond',serif;font-size:16px;color:#f4eee2;font-weight:500;line-height:1.2;}
  .ja-item .info .mt{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#c9a24b;}
  .ja-item .info .pr{font-family:'Cormorant Garamond',serif;font-size:15px;color:#f3dca0;margin-top:2px;}
  .ja-item .qty{display:inline-flex;align-items:center;gap:8px;margin-top:6px;}
  .ja-item .qty button{width:24px;height:24px;border-radius:50%;border:1px solid rgba(201,162,75,.35);background:none;color:#e7c87a;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit;}
  .ja-item .qty button:hover{background:rgba(201,162,75,.1);}
  .ja-item .qty .v{font-size:13px;color:#cfc8ba;min-width:18px;text-align:center;}
  .ja-item .rm{align-self:flex-start;background:none;border:0;color:#7d7768;cursor:pointer;padding:4px;border-radius:50%;}
  .ja-item .rm:hover{color:#e7c87a;}

  .ja-foot{padding:18px 24px 22px;border-top:1px solid rgba(201,162,75,.18);background:#080605;}
  .ja-foot .ja-tot{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
  .ja-foot .ja-tot .tl{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#928c80;}
  .ja-foot .ja-tot .tv{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:500;color:#f3dca0;}
  .ja-foot .ja-tot .tv small{font-size:12px;color:#928c80;font-weight:400;margin-left:4px;}
  .ja-foot .ja-actions{display:flex;flex-direction:column;gap:8px;}
  .ja-foot .ja-checkout{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:14px 22px;border-radius:999px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#0c0a06;background:linear-gradient(120deg,#f3dca0,#c9a24b 55%,#a17e38);border:0;cursor:pointer;font-family:inherit;transition:transform .3s ease,box-shadow .3s ease;}
  .ja-foot .ja-checkout:hover{transform:translateY(-1px);box-shadow:0 16px 36px -14px rgba(201,162,75,.7);}
  .ja-foot .ja-clear{background:none;border:0;color:#7d7768;font-size:11px;letter-spacing:.2em;text-transform:uppercase;padding:6px;cursor:pointer;font-family:inherit;}
  .ja-foot .ja-clear:hover{color:#e7c87a;}

  /* PRODUCT MODAL */
  .ja-mback{position:fixed;inset:0;background:rgba(8,7,5,0.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:220;display:none;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .35s ease;overflow-y:auto;}
  .ja-mback.open{display:flex;opacity:1;}
  .ja-modal{position:relative;width:100%;max-width:920px;background:#100d09;border:1px solid rgba(201,162,75,.22);border-radius:24px;overflow:hidden;display:grid;grid-template-columns:1.05fr .95fr;gap:0;box-shadow:0 60px 130px -50px rgba(0,0,0,.95),0 0 80px -30px rgba(201,162,75,.25);transform:translateY(20px);transition:transform .45s cubic-bezier(.22,.61,.36,1);color:var(--ja-text);font-family:'Jost',sans-serif;font-weight:300;}
  .ja-mback.open .ja-modal{transform:translateY(0);}
  .ja-modal .mi{position:relative;background:#161208;aspect-ratio:1/1.05;}
  .ja-modal .mi img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  .ja-modal .mi .bd{position:absolute;top:14px;left:14px;padding:5px 12px;border-radius:999px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#0c0a06;background:linear-gradient(120deg,#f3dca0,#c9a24b);}
  .ja-modal .mb{padding:28px 30px 30px;display:flex;flex-direction:column;gap:8px;}
  .ja-modal .mb .mt{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#c9a24b;}
  .ja-modal .mb h2{margin:6px 0 0;font-family:'Cormorant Garamond',serif;font-weight:500;font-size:30px;color:#f4eee2;line-height:1.15;padding-bottom:0;}
  .ja-modal .mb .ds{margin:10px 0 0;font-size:14px;line-height:1.65;color:#b3ac9f;}
  .ja-modal .mb .pr{margin-top:14px;padding:14px 0;border-top:1px solid rgba(201,162,75,.14);border-bottom:1px solid rgba(201,162,75,.14);display:flex;align-items:baseline;gap:12px;}
  .ja-modal .mb .pr .pl{font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:#928c80;}
  .ja-modal .mb .pr .pv{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:500;color:#f3dca0;line-height:1;}
  .ja-modal .mb .pr .pv small{font-size:12px;color:#928c80;margin-left:4px;font-weight:400;}
  .ja-modal .mb .ac{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;}
  .ja-modal .mb .ac .pa{flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:13px 20px;border-radius:999px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#0c0a06;background:linear-gradient(120deg,#f3dca0,#c9a24b 55%,#a17e38);border:0;cursor:pointer;font-family:inherit;transition:transform .3s ease;}
  .ja-modal .mb .ac .pa:hover{transform:translateY(-1px);}
  .ja-modal .mb .ac .sa{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 18px;border-radius:999px;font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;color:#cfc8ba;border:1px solid rgba(201,162,75,.25);background:none;cursor:pointer;font-family:inherit;}
  .ja-modal .mb .ac .sa:hover{border-color:rgba(201,162,75,.7);color:#e7c87a;}
  .ja-modal .cl{position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:50%;background:rgba(11,9,7,.65);backdrop-filter:blur(8px);border:1px solid rgba(201,162,75,.3);color:#e7c87a;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2;}
  .ja-modal .cl:hover{background:rgba(201,162,75,.15);}
  @media(max-width:780px){.ja-modal{grid-template-columns:1fr;max-width:520px;}.ja-modal .mi{aspect-ratio:1/1;}.ja-modal .mb{padding:22px 22px 24px;}.ja-modal .mb h2{font-size:24px;}}

  .ja-toast{position:fixed;bottom:96px;right:22px;z-index:230;padding:12px 18px;background:rgba(11,9,7,.92);border:1px solid rgba(201,162,75,.4);border-radius:999px;color:#f4eee2;font-family:'Jost',sans-serif;font-size:13px;letter-spacing:.06em;display:flex;align-items:center;gap:10px;transform:translateY(20px);opacity:0;transition:opacity .3s ease,transform .3s ease;pointer-events:none;}
  .ja-toast.show{opacity:1;transform:translateY(0);}
  .ja-toast svg{color:#f3dca0;}

  /* LOCAL PICKER */
  .ja-pick{position:fixed;inset:0;z-index:240;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(8,7,5,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:0;transition:opacity .3s ease;font-family:'Jost',sans-serif;}
  .ja-pick.open{display:flex;opacity:1;}
  .ja-pick-card{position:relative;width:100%;max-width:440px;background:#100d09;border:1px solid rgba(201,162,75,.25);border-radius:22px;padding:28px 26px 26px;color:#efe9dd;transform:translateY(20px);transition:transform .35s cubic-bezier(.22,.61,.36,1);box-shadow:0 50px 110px -50px rgba(0,0,0,.95),0 0 60px -30px rgba(201,162,75,.3);}
  .ja-pick.open .ja-pick-card{transform:translateY(0);}
  .ja-pick-card .pk-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;background:rgba(11,9,7,.6);border:1px solid rgba(201,162,75,.22);color:#cfc8ba;display:flex;align-items:center;justify-content:center;cursor:pointer;}
  .ja-pick-card .pk-x:hover{color:#f3dca0;border-color:rgba(201,162,75,.6);}
  .ja-pick-card h3{margin:0;font-family:'CommercialScript',cursive;font-weight:400;font-size:30px;color:#f4eee2;line-height:1.1;padding-bottom:.15em;}
  .ja-pick-card .pk-sub{margin:4px 0 18px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#c9a24b;}
  .ja-pick-opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .ja-pick-opt{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:16px 16px 18px;border:1px solid rgba(201,162,75,.22);border-radius:16px;background:rgba(20,16,11,.6);color:inherit;font-family:inherit;cursor:pointer;text-align:left;transition:border-color .3s ease,background .3s ease,transform .3s ease;}
  .ja-pick-opt:hover{border-color:rgba(243,220,160,.6);background:rgba(201,162,75,.08);transform:translateY(-2px);}
  .ja-pick-opt .pk-lbl{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#928c80;}
  .ja-pick-opt .pk-nm{font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:500;color:#f4eee2;line-height:1.1;}
  .ja-pick-opt .pk-ph{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#e7c87a;margin-top:4px;}
  .ja-pick-opt .pk-ph svg{color:#c9a24b;}
  @media(max-width:520px){.ja-pick-opts{grid-template-columns:1fr;}.ja-pick-card{padding:24px 20px;}.ja-pick-card h3{font-size:26px;}}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ============ DOM ============
  function buildUI(){
    document.body.insertAdjacentHTML('beforeend', `
      <button class="ja-fab" id="ja-fab" aria-label="Carrito">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
        <span class="ja-fab-badge hide" id="ja-fab-badge">0</span>
      </button>
      <div class="ja-back" id="ja-back"></div>
      <aside class="ja-drawer" id="ja-drawer" role="dialog" aria-label="Carrito">
        <div class="ja-hd">
          <h3>Mi carrito</h3>
          <button class="ja-close" id="ja-drawer-close" aria-label="Cerrar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
        <div class="ja-items" id="ja-items"></div>
        <div class="ja-foot" id="ja-foot" style="display:none;">
          <div class="ja-tot"><span class="tl">Total</span><span class="tv" id="ja-total">₲ 0<small>PYG</small></span></div>
          <div class="ja-actions">
            <button class="ja-checkout" id="ja-checkout">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z"/></svg>
              Finalizar por WhatsApp
            </button>
            <button class="ja-clear" id="ja-clear">Vaciar carrito</button>
          </div>
        </div>
      </aside>

      <div class="ja-mback" id="ja-mback" role="dialog" aria-modal="true">
        <div class="ja-modal" id="ja-modal">
          <button class="cl" id="ja-modal-close" aria-label="Cerrar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          <div class="mi">
            <img id="ja-modal-img" src="" alt="">
            <span class="bd" id="ja-modal-badge" style="display:none;">Top</span>
          </div>
          <div class="mb">
            <span class="mt" id="ja-modal-mat"></span>
            <h2 id="ja-modal-name"></h2>
            <p class="ds" id="ja-modal-desc"></p>
            <div class="pr"><span class="pl">Precio</span><span class="pv" id="ja-modal-price"></span></div>
            <div class="ac">
              <button class="pa" id="ja-modal-add">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
                Agregar al carrito
              </button>
              <a class="sa" id="ja-modal-wa" href="#" target="_blank" rel="noopener">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z"/></svg>
                Consultar
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="ja-toast" id="ja-toast">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        <span id="ja-toast-msg">Agregado al carrito</span>
      </div>

      <div class="ja-pick" id="ja-pick" role="dialog" aria-modal="true">
        <div class="ja-pick-card">
          <button class="pk-x" id="ja-pick-close" aria-label="Cerrar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          <h3>Elegí tu local</h3>
          <div class="pk-sub">¿A qué sucursal enviamos tu pedido?</div>
          <div class="ja-pick-opts">
            <button class="ja-pick-opt" type="button" data-local="mp">
              <span class="pk-lbl">Local Multiplaza</span>
              <span class="pk-nm">Multiplaza</span>
              <span class="pk-ph"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z"/></svg>0974 702 574</span>
            </button>
            <button class="ja-pick-opt" type="button" data-local="sl">
              <span class="pk-lbl">Local San Lorenzo</span>
              <span class="pk-nm">San Lorenzo</span>
              <span class="pk-ph"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z"/></svg>0974 702 576</span>
            </button>
          </div>
        </div>
      </div>
    `);
  }

  // ============ RENDER ============
  function totalAmount(){ return cart.reduce((s,it) => s + it.price * it.qty, 0); }
  function totalCount(){ return cart.reduce((s,it) => s + it.qty, 0); }

  function renderBadge(){
    const b = document.getElementById('ja-fab-badge');
    const n = totalCount();
    b.textContent = n;
    b.classList.toggle('hide', n === 0);
  }

  function renderDrawer(){
    const items = document.getElementById('ja-items');
    const foot = document.getElementById('ja-foot');
    if(!cart.length){
      items.innerHTML = `<div class="ja-empty">
        <div class="icc"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg></div>
        <h4>Tu carrito está vacío</h4>
        <p>Agregá piezas para verlas acá.</p>
        <button class="ja-cont" onclick="document.getElementById('ja-back').click()">Seguir explorando</button>
      </div>`;
      foot.style.display = 'none';
      return;
    }
    items.innerHTML = cart.map(it => `
      <div class="ja-item" data-id="${it.id}">
        <div class="thumb"><img src="${it.img}" alt="${it.name}"></div>
        <div class="info">
          <span class="mt">${it.material}</span>
          <span class="nm">${it.name}</span>
          <span class="pr">₲ ${fmt(it.price * it.qty)}</span>
          <div class="qty">
            <button data-act="dec" aria-label="Restar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg></button>
            <span class="v">${it.qty}</span>
            <button data-act="inc" aria-label="Sumar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
        </div>
        <button class="rm" data-act="rm" aria-label="Quitar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
    `).join('');
    document.getElementById('ja-total').innerHTML = '₲ ' + fmt(totalAmount()) + '<small>PYG</small>';
    foot.style.display = 'block';
  }

  function renderAll(){ renderBadge(); renderDrawer(); }

  // ============ ACTIONS ============
  function addItem(p){
    const existing = cart.find(x => x.id === p.id);
    if(existing) existing.qty += 1;
    else cart.push({ id:p.id, name:p.name, material:p.material, price:p.price, img:p.img, qty:1 });
    save(cart);
    renderAll();
    toast('Agregado al carrito');
  }
  function updateQty(id, delta){
    const it = cart.find(x => x.id === id);
    if(!it) return;
    it.qty += delta;
    if(it.qty <= 0) cart = cart.filter(x => x.id !== id);
    save(cart);
    renderAll();
  }
  function removeItem(id){
    cart = cart.filter(x => x.id !== id);
    save(cart);
    renderAll();
  }
  function clearCart(){
    if(!cart.length) return;
    if(!confirm('¿Vaciar todo el carrito?')) return;
    cart = [];
    save(cart);
    renderAll();
  }
  // Picker context: 'cart' (order from cart), 'inquiry' (generic), 'product' (specific item)
  let pickerMode = 'inquiry';
  let pickerProduct = null;

  function checkout(){
    if(!cart.length) return;
    pickerMode = 'cart';
    pickerProduct = null;
    openLocalPicker('Elegí tu local', '¿A qué sucursal enviamos tu pedido?');
  }
  function startInquiry(){
    pickerMode = 'inquiry';
    pickerProduct = null;
    openLocalPicker('Elegí tu local', '¿Con qué sucursal querés contactarte?');
  }
  function startProductInquiry(p){
    pickerMode = 'product';
    pickerProduct = p;
    openLocalPicker('Elegí tu local', '¿A qué sucursal querés consultar esta pieza?');
  }
  function sendOrderToLocal(localKey){
    const phone = localKey === 'sl' ? WA_SAN_LORENZO : WA_MULTIPLAZA;
    const localName = localKey === 'sl' ? 'San Lorenzo' : 'Multiplaza';
    let msg;
    if(pickerMode === 'cart'){
      const lines = cart.map(it => `• ${it.name} (${it.material}) x${it.qty} — ₲ ${fmt(it.price*it.qty)}`).join('\n');
      const total = '₲ ' + fmt(totalAmount()) + ' PYG';
      msg = `Hola Joyería Artesanos (local ${localName}), quiero hacer un pedido:\n\n${lines}\n\nTotal: ${total}`;
    } else if(pickerMode === 'product' && pickerProduct){
      const p = pickerProduct;
      msg = `Hola Joyería Artesanos (local ${localName}), quisiera consultar por "${p.name}" (${p.material} · ₲ ${fmt(p.price)}).`;
    } else {
      msg = `Hola Joyería Artesanos (local ${localName}), quisiera consultar por una pieza.`;
    }
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
    closeLocalPicker();
  }
  function openLocalPicker(title, sub){
    const t = document.querySelector('#ja-pick h3');
    const s = document.querySelector('#ja-pick .pk-sub');
    if(t && title) t.textContent = title;
    if(s && sub) s.textContent = sub;
    document.getElementById('ja-pick').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLocalPicker(){
    document.getElementById('ja-pick').classList.remove('open');
    if(!document.getElementById('ja-drawer').classList.contains('open') && !document.getElementById('ja-mback').classList.contains('open')) document.body.style.overflow = '';
  }

  // ============ DRAWER ============
  function openDrawer(){
    document.getElementById('ja-back').classList.add('open');
    document.getElementById('ja-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderDrawer();
  }
  function closeDrawer(){
    document.getElementById('ja-back').classList.remove('open');
    document.getElementById('ja-drawer').classList.remove('open');
    if(!document.getElementById('ja-mback').classList.contains('open')) document.body.style.overflow = '';
  }

  // ============ MODAL ============
  let currentProduct = null;
  function openModal(p){
    currentProduct = p;
    document.getElementById('ja-modal-img').src = p.img;
    document.getElementById('ja-modal-img').alt = p.name;
    document.getElementById('ja-modal-mat').textContent = p.material;
    document.getElementById('ja-modal-name').textContent = p.name;
    document.getElementById('ja-modal-desc').textContent = p.desc || '';
    document.getElementById('ja-modal-price').innerHTML = '₲ ' + fmt(p.price) + '<small>PYG</small>';
    const bd = document.getElementById('ja-modal-badge');
    bd.style.display = p.badge ? 'inline-block' : 'none';
    if(p.badge) bd.textContent = p.badge;
    document.getElementById('ja-modal-wa').href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent('Hola Joyería Artesanos, quisiera consultar por "' + p.name + '" (' + p.material + ' · ₲ ' + fmt(p.price) + ').');
    document.getElementById('ja-mback').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    document.getElementById('ja-mback').classList.remove('open');
    if(!document.getElementById('ja-drawer').classList.contains('open')) document.body.style.overflow = '';
  }

  // ============ TOAST ============
  let toastTimer;
  function toast(msg){
    const t = document.getElementById('ja-toast');
    document.getElementById('ja-toast-msg').textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ============ INIT ============
  function ensureUI(){
    if(!document.getElementById('ja-fab')){
      buildUI();
      renderAll();
    }
  }
  function init(){
    // Defensive: clear body overflow and close any stuck overlays on init
    if(document.body && document.body.style.overflow === 'hidden') document.body.style.overflow = '';
    ensureUI();
    // Force close any overlay accidentally left open
    ['ja-back','ja-drawer','ja-mback','ja-pick'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.classList.remove('open');
    });

    // Re-inject UI if DCLogic or some other framework wipes the body
    new MutationObserver(() => ensureUI()).observe(document.body, { childList:true });

    // ALL click handling via global delegation — survives DOM rebuilds
    document.addEventListener('click', e => {
      // Add to cart (highest priority)
      const addBtn = e.target.closest('[data-ja-add]');
      if(addBtn && addBtn.dataset.jaProduct){
        e.preventDefault(); e.stopPropagation();
        try { addItem(JSON.parse(addBtn.dataset.jaProduct)); } catch(_){}
        return;
      }
      // Open product modal
      const openBtn = e.target.closest('[data-ja-open]');
      if(openBtn && openBtn.dataset.jaProduct){
        e.preventDefault(); e.stopPropagation();
        try { openModal(JSON.parse(openBtn.dataset.jaProduct)); } catch(_){}
        return;
      }
      // Hijack any wa.me link → open local picker for inquiry
      const waLink = e.target.closest('a[href*="wa.me/"]');
      if(waLink && !waLink.dataset.jaPassthrough){
        e.preventDefault();
        e.stopPropagation();
        // Product context: from link's data-ja-product, or cart's open modal
        let prod = null;
        if(waLink.dataset.jaProduct){
          try { prod = JSON.parse(waLink.dataset.jaProduct); } catch(_){}
        }
        if(!prod){
          const cartModal = document.getElementById('ja-mback');
          if(cartModal && cartModal.classList.contains('open') && currentProduct) prod = currentProduct;
        }
        if(!prod){
          const catModal = document.getElementById('modalBack');
          if(catModal && catModal.classList.contains('open') && window.__jaCurrentCatalogProduct) prod = window.__jaCurrentCatalogProduct;
        }
        if(prod) startProductInquiry(prod);
        else startInquiry();
        return;
      }
      // Cart FAB
      if(e.target.closest('#ja-fab')){ e.preventDefault(); openDrawer(); return; }
      // Drawer backdrop or close
      if(e.target.closest('#ja-drawer-close')){ closeDrawer(); return; }
      if(e.target.id === 'ja-back'){ closeDrawer(); return; }
      // Drawer footer actions
      if(e.target.closest('#ja-checkout')){ checkout(); return; }
      if(e.target.closest('#ja-clear')){ clearCart(); return; }
      // Local picker
      if(e.target.closest('#ja-pick-close')){ closeLocalPicker(); return; }
      if(e.target.id === 'ja-pick'){ closeLocalPicker(); return; }
      const pickBtn = e.target.closest('.ja-pick-opt[data-local]');
      if(pickBtn){ sendOrderToLocal(pickBtn.dataset.local); return; }
      // Drawer item actions
      const itemBtn = e.target.closest('.ja-item button[data-act]');
      if(itemBtn){
        const row = itemBtn.closest('.ja-item');
        const id = row && row.dataset.id;
        if(!id) return;
        if(itemBtn.dataset.act === 'inc') updateQty(id, 1);
        else if(itemBtn.dataset.act === 'dec') updateQty(id, -1);
        else if(itemBtn.dataset.act === 'rm') removeItem(id);
        return;
      }
      // Modal close
      if(e.target.closest('#ja-modal-close')){ closeModal(); return; }
      if(e.target.id === 'ja-mback'){ closeModal(); return; }
      // Modal add to cart
      if(e.target.closest('#ja-modal-add')){
        if(currentProduct) addItem(currentProduct);
        return;
      }
    }, true);

    document.addEventListener('keydown', e => {
      if(e.key === 'Escape'){ closeDrawer(); closeModal(); closeLocalPicker(); }
    });
  }

  // ============ PUBLIC API ============
  window.JACart = {
    add: addItem,
    open: openDrawer,
    openProduct: openModal,
    inquire: startInquiry,
    inquireProduct: startProductInquiry,
    clear: () => { cart = []; save(cart); renderAll(); },
    get: () => cart.slice(),
    count: totalCount,
    total: totalAmount,
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
