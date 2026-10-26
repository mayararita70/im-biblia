/* =====================================
   IM BÍBLIAS — CATÁLOGO COM SUPABASE
===================================== */

let products = [];
let cart = JSON.parse(localStorage.getItem("imBibliaCart")) || [];
let supabase = null;
let toastTimer = null;

// Número da loja (com 55 + DDD). Usado no rodapé e no botão de pedido.
const WHATSAPP_PHONE = "558296460703";


/* =====================================
   FORMATAÇÃO E SEGURANÇA
===================================== */

function formatPrice(price) {
    return Number(price || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function normalizeCategory(category) {
    const value = String(category || "").trim().toLowerCase();

    if (value.includes("harpa")) return "harpa";
    if (value.includes("livro")) return "livro";
    if (value.includes("bíblia") || value.includes("biblia")) return "biblia";

    return value;
}

function getCategoryName(category) {
    const names = {
        biblia: "Bíblia",
        harpa: "Harpa",
        livro: "Livro"
    };

    const normalized = normalizeCategory(category);
    return names[normalized] || category || "Produto";
}


// Para a pesquisa achar "biblia" mesmo quando o produto é "Bíblia".
function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}


/* =====================================
   BUSCAR PRODUTOS NO SUPABASE
===================================== */

async function loadProductsFromSupabase() {
    const container = document.getElementById("products-list");

    if (container) {
        container.innerHTML = "<p>Carregando produtos...</p>";
    }

    try {
        // Importa a conexão que já é usada pelo painel administrativo.
        const module = await import("./supabase.js");
        supabase = module.supabase;

        if (!supabase) {
            throw new Error("A conexão com o Supabase não foi encontrada.");
        }

        const { data: rows, error } = await supabase
            .from("produtos")
            .select("*")
            .order("id", { ascending: false });

        if (error) throw error;

        // Busca as fotos e vídeos cadastrados no painel.
        const { data: mediaRows, error: mediaError } = await supabase
            .from("produto_imagens")
            .select("produto_id, url, tipo, principal, ordem")
            .order("ordem", { ascending: true });

        if (mediaError) {
            console.warn(
                "Não foi possível carregar as fotos adicionais:",
                mediaError.message
            );
        }

        const media = mediaError ? [] : (mediaRows || []);

        products = (rows || [])
            // Produtos inativos não aparecem no catálogo público.
            .filter(row => row.ativo !== false)
            .map(row => {
                // Todas as mídias deste produto (fotos e vídeos), na ordem do painel.
                const allMedia = media.filter(item =>
                    String(item.produto_id) === String(row.id)
                );

                const productMedia = allMedia.filter(item =>
                    item.tipo === "imagem" || !item.tipo
                );

                const mainMedia = productMedia.find(item => item.principal);
                const firstMedia = mainMedia || productMedia[0];

                // Galeria da página do produto.
                const gallery = allMedia.map(item => ({
                    url: item.url,
                    type: item.tipo === "video" ? "video" : "image"
                }));

                // A foto principal (imagem_url) vai sempre na primeira posição.
                if (row.imagem_url) {
                    const mainIndex = gallery.findIndex(
                        item => item.url === row.imagem_url
                    );

                    if (mainIndex > 0) {
                        gallery.unshift(gallery.splice(mainIndex, 1)[0]);
                    } else if (mainIndex === -1) {
                        gallery.unshift({ url: row.imagem_url, type: "image" });
                    }
                }

                return {
                    id: Number(row.id),
                    name: row.nome || "Produto sem nome",
                    category: normalizeCategory(row.categoria),
                    price: Number(row.preco || 0),
                    stock: Math.max(0, Number(row.estoque || 0)),
                    image: row.imagem_url || (firstMedia ? firstMedia.url : ""),
                    gallery: gallery,
                    description: row.descricao || "",
                    active: row.ativo !== false
                };
            });

        // Remove do carrinho produtos que já não existem no banco
        // (só se a lista de produtos carregou).
        if (products.length > 0) {
            cart = cart.filter(item =>
                products.some(product => product.id === Number(item.id))
            );
        }

        saveCart();
        updateCartCount();

        loadFeaturedProducts();
        loadCatalog();
        loadProductPage();
        loadCart();

    } catch (error) {
        console.error("Erro ao carregar os produtos:", error);

        if (container) {
            container.innerHTML = `
                <div class="product-load-error">
                    <h3>Não foi possível carregar os produtos.</h3>
                    <p>Verifique sua conexão e tente novamente.</p>
                </div>
            `;
        }

        const result = document.getElementById("product-result");
        if (result) result.textContent = "Erro ao carregar os produtos.";
    }
}


/* =====================================
   CARRINHO — BASE
===================================== */

function saveCart() {
    localStorage.setItem("imBibliaCart", JSON.stringify(cart));
}

function updateCartCount() {
    const count = cart.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
    );

    const element = document.getElementById("cart-count");

    if (element) {
        element.textContent = count;
    }
}


/* =====================================
   CARD DE PRODUTO
===================================== */

function createProductCard(product) {
    const available = product.stock > 0;
    const name = escapeHTML(product.name);
    const description = escapeHTML(product.description);
    const category = escapeHTML(getCategoryName(product.category));
    const image = escapeHTML(product.image || "");
    const imageHTML = image
        ? `<img src="${image}" alt="${name}" loading="lazy"
                onerror="this.style.display='none'">`
        : `<div class="product-image-placeholder">📖</div>`;

    return `
        <article class="product-card">
            <a href="produto.html?id=${product.id}">
                <div class="product-image">
                    ${imageHTML}
                </div>
            </a>

            <div class="product-info">
                <span class="product-category">${category}</span>

                <h3 class="product-name">${name}</h3>

                <p class="product-description">${description}</p>

                <div class="product-price">
                    ${formatPrice(product.price)}
                </div>

                <div class="stock ${available ? "available" : "unavailable"}">
                    ${available ? "● Disponível" : "● Esgotado"}
                </div>

                ${
                    available
                        ? `<button class="product-button"
                                   onclick="addToCart(${product.id})">
                               Adicionar ao carrinho
                           </button>`
                        : `<button class="product-button disabled" disabled>
                               Esgotado
                           </button>`
                }
            </div>
        </article>
    `;
}


/* =====================================
   PRODUTOS DA PÁGINA INICIAL
===================================== */

function loadFeaturedProducts() {
    const container = document.getElementById("featured-products");
    if (!container) return;

    const featured = products.filter(product => product.stock > 0);

    container.innerHTML = featured.length
        ? featured.map(createProductCard).join("")
        : "<p>Nenhum produto disponível no momento.</p>";

    const carousel = container.closest(".featured-carousel");
    if (!carousel) return;

    const prev = carousel.querySelector(".featured-prev");
    const next = carousel.querySelector(".featured-next");

    if (!prev || !next) return;

    // Evita registrar os mesmos eventos mais de uma vez.
    if (prev.dataset.carouselReady === "true") return;

    prev.dataset.carouselReady = "true";
    next.dataset.carouselReady = "true";

    function moveCarousel(direction) {
        const card = container.querySelector(".product-card");
        if (!card) return;

        const styles = window.getComputedStyle(container);
        const gap = parseFloat(styles.columnGap) || 0;
        const distance = card.getBoundingClientRect().width + gap;

        container.scrollBy({
            left: direction * distance,
            behavior: "smooth"
        });
    }

    prev.addEventListener("click", () => moveCarousel(-1));
    next.addEventListener("click", () => moveCarousel(1));
}


/* =====================================
   CATÁLOGO E FILTROS
===================================== */

function loadCatalog() {
    const container = document.getElementById("products-list");
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const selectedCategory = normalizeCategory(
        params.get("categoria") || "todos"
    );

    let filtered = [...products];

    if (selectedCategory !== "todos") {
        filtered = filtered.filter(product =>
            normalizeCategory(product.category) === selectedCategory
        );
    }

    // Usa o campo de filtro da página; se não houver, usa o ?busca= do endereço.
    const search = document.getElementById("search");
    const searchText = normalizeText(
        search ? search.value : (params.get("busca") || "")
    );

    if (searchText) {
        filtered = filtered.filter(product =>
            normalizeText(product.name).includes(searchText) ||
            normalizeText(product.description).includes(searchText) ||
            normalizeText(getCategoryName(product.category)).includes(searchText)
        );
    }

    const order = document.getElementById("price-filter");

    if (order && order.value === "low") {
        filtered.sort((a, b) => a.price - b.price);
    } else if (order && order.value === "high") {
        filtered.sort((a, b) => b.price - a.price);
    }

    container.innerHTML = filtered.length
        ? filtered.map(createProductCard).join("")
        : "<div><h3>Nenhum produto encontrado.</h3></div>";

    const result = document.getElementById("product-result");

    if (result) {
        result.textContent = `${filtered.length} produto(s) encontrado(s)`;
    }
}

function setupFilters() {
    const buttons = document.querySelectorAll(".filter-button");

    function updateActiveButton() {
        const params = new URLSearchParams(window.location.search);
        const category = normalizeCategory(params.get("categoria") || "todos");

        buttons.forEach(button => {
            button.classList.toggle(
                "active",
                normalizeCategory(button.dataset.category) === category
            );
        });
    }

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            const category = normalizeCategory(button.dataset.category);
            const url = new URL(window.location.href);

            if (category === "todos") {
                url.searchParams.delete("categoria");
            } else {
                url.searchParams.set("categoria", category);
            }

            window.history.pushState({}, "", url);
            updateActiveButton();
            loadCatalog();
        });
    });

    const search = document.getElementById("search");
    if (search) search.addEventListener("input", loadCatalog);

    const priceFilter = document.getElementById("price-filter");
    if (priceFilter) priceFilter.addEventListener("change", loadCatalog);

    window.addEventListener("popstate", () => {
        updateActiveButton();
        loadCatalog();
    });

    updateActiveButton();
}


/* =====================================
   CABEÇALHO E RODAPÉ (IGUAIS EM TODAS AS PÁGINAS)
   Para mudar o menu, a logo ou o rodapé,
   é só editar aqui.
===================================== */

function setupLayout() {
    const header = document.querySelector(".header");

    if (header) {
        header.innerHTML = `
            <div class="header-container">

                <a href="index.html" class="logo-area"
                   aria-label="IM Bíblias - Página inicial">
                    <img src="assets/img/logo.png" alt="Logo da IM Bíblias">

                    <span class="brand-text">
                        <span class="brand-name">IM BÍBLIAS</span>
                        <span class="brand-tagline">Sabedoria &amp; Fé</span>
                    </span>
                </a>

                <button
                    type="button"
                    class="menu-toggle"
                    aria-label="Abrir menu"
                    aria-expanded="false"
                >
                    ☰
                </button>

                <nav class="menu" aria-label="Menu principal">
                    <a href="index.html">Início</a>
                    <a href="produtos.html?categoria=biblia">Bíblias</a>
                    <a href="produtos.html?categoria=harpa">Harpas</a>
                    <a href="produtos.html?categoria=livro">Livros</a>
                    <a href="produtos.html?categoria=ofertas">Ofertas</a>
                </nav>

                <div class="header-actions">

                    <a href="produtos.html" class="search-button"
                       aria-label="Pesquisar produtos"
                       title="Pesquisar produtos">🔍</a>

                    <a href="login.html" class="profile-button"
                       aria-label="Entrar" title="Entrar">👤</a>

                    <a href="carrinho.html" class="cart-button"
                       aria-label="Carrinho de compras"
                       title="Carrinho de compras">
                        🛒
                        <span id="cart-count">0</span>
                    </a>

                </div>

            </div>
        `;

        const botaoMenu = header.querySelector(".menu-toggle");
        const menu = header.querySelector(".menu");

        if (botaoMenu && menu) {
            botaoMenu.addEventListener("click", () => {
                const aberto = menu.classList.toggle("menu-open");

                botaoMenu.setAttribute("aria-expanded", String(aberto));
                botaoMenu.setAttribute(
                    "aria-label",
                    aberto ? "Fechar menu" : "Abrir menu"
                );

                botaoMenu.textContent = aberto ? "✕" : "☰";
            });

            menu.querySelectorAll("a").forEach(link => {
                link.addEventListener("click", () => {
                    menu.classList.remove("menu-open");
                    botaoMenu.setAttribute("aria-expanded", "false");
                    botaoMenu.setAttribute("aria-label", "Abrir menu");
                    botaoMenu.textContent = "☰";
                });
            });
        }
    }

    const footer = document.querySelector(".footer");

    if (footer) {
        footer.innerHTML = `
            <div>
                <h3>IM Bíblias</h3>
                <p>Bíblias, livros e produtos cristãos.</p>
                <p>Sabedoria &amp; Fé</p>
            </div>

            <div>
                <h4>Atendimento</h4>
                <p>📍 Capela - AL</p>
                <p>🚚 Entregas em Capela</p>
            </div>

            <div>
                <h4>Contato</h4>
                <p>
                    <a href="https://wa.me/${WHATSAPP_PHONE}"
                       target="_blank" rel="noopener">WhatsApp</a>
                </p>
                <p>
                    <a href="https://www.instagram.com/imbiblias?mdxt=OHZxcWYzZHFpanhv"
                       target="_blank" rel="noopener">Instagram</a>
                </p>
            </div>

            <p class="footer-copy">
                © ${new Date().getFullYear()} IM Bíblias.
                Todos os direitos reservados.
            </p>
        `;
    }
}


/* =====================================
   PESQUISA NO CABEÇALHO (LUPA)
===================================== */

function setupHeaderSearch() {
    const button = document.querySelector(".search-button");
    const header = document.querySelector(".header");

    const params = new URLSearchParams(window.location.search);
    const currentSearch = params.get("busca") || "";

    // Na página de produtos, o campo de filtro já abre preenchido.
    const catalogSearch = document.getElementById("search");

    if (catalogSearch && currentSearch) {
        catalogSearch.value = currentSearch;
    }

    if (!button || !header) return;

    const panel = document.createElement("div");
    panel.className = "header-search";
    panel.hidden = true;

    panel.innerHTML = `
        <div class="header-search-inner">
            <form class="header-search-form" role="search">
                <input
                    type="search"
                    class="header-search-input"
                    placeholder="Pesquise por Bíblia, Harpa, livro..."
                    aria-label="Pesquisar no site"
                    autocomplete="off"
                >
                <button type="submit" class="header-search-submit">
                    Buscar
                </button>
                <button type="button" class="header-search-close"
                        aria-label="Fechar pesquisa">✕</button>
            </form>

            <ul class="header-search-results" hidden></ul>
        </div>
    `;

    header.appendChild(panel);

    const form = panel.querySelector(".header-search-form");
    const input = panel.querySelector(".header-search-input");
    const results = panel.querySelector(".header-search-results");
    const close = panel.querySelector(".header-search-close");

    input.value = currentSearch;
    button.setAttribute("aria-expanded", "false");

    function openSearch() {
        panel.hidden = false;
        button.setAttribute("aria-expanded", "true");
        input.focus();
        input.select();
        renderResults();
    }

    function closeSearch() {
        panel.hidden = true;
        results.hidden = true;
        button.setAttribute("aria-expanded", "false");
    }

    function searchUrl(term) {
        return term
            ? `produtos.html?busca=${encodeURIComponent(term)}`
            : "produtos.html";
    }

    // Sugestões que aparecem enquanto a pessoa digita.
    function renderResults() {
        const term = normalizeText(input.value);

        if (term.length < 2 || products.length === 0) {
            results.hidden = true;
            results.replaceChildren();
            return;
        }

        const matches = products.filter(product =>
            normalizeText(product.name).includes(term) ||
            normalizeText(product.description).includes(term) ||
            normalizeText(getCategoryName(product.category)).includes(term)
        );

        if (matches.length === 0) {
            results.innerHTML = `
                <li class="header-search-empty">
                    Nenhum produto encontrado para "${escapeHTML(input.value.trim())}".
                </li>
            `;
            results.hidden = false;
            return;
        }

        results.innerHTML = matches.slice(0, 5).map(product => {
            const image = escapeHTML(product.image || "");

            return `
                <li>
                    <a href="produto.html?id=${product.id}"
                       class="header-search-item">
                        ${
                            image
                                ? `<img src="${image}" alt="" loading="lazy">`
                                : `<span class="header-search-noimg">📖</span>`
                        }
                        <span class="header-search-text">
                            <strong>${escapeHTML(product.name)}</strong>
                            <small>
                                ${escapeHTML(getCategoryName(product.category))}
                                · ${formatPrice(product.price)}
                            </small>
                        </span>
                    </a>
                </li>
            `;
        }).join("") + `
            <li>
                <a href="${searchUrl(input.value.trim())}"
                   class="header-search-all">
                    Ver todos os resultados (${matches.length})
                </a>
            </li>
        `;

        results.hidden = false;
    }

    button.addEventListener("click", event => {
        // Sem JavaScript o link continua levando para a página de produtos.
        event.preventDefault();

        if (panel.hidden) {
            openSearch();
        } else {
            closeSearch();
        }
    });

    input.addEventListener("input", renderResults);

    form.addEventListener("submit", event => {
        event.preventDefault();
        window.location.href = searchUrl(input.value.trim());
    });

    close.addEventListener("click", () => {
        closeSearch();
        button.focus();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) {
            closeSearch();
            button.focus();
        }
    });

    // Clicar fora fecha a pesquisa.
    document.addEventListener("click", event => {
        if (
            !panel.hidden &&
            !panel.contains(event.target) &&
            !button.contains(event.target)
        ) {
            closeSearch();
        }
    });
}


/* =====================================
   GALERIA DE FOTOS E VÍDEOS
===================================== */

function buildGalleryHTML(items, productName) {
    if (items.length === 0) {
        return `
            <div class="product-detail-image">
                <div class="product-image-placeholder">📖</div>
            </div>
        `;
    }

    const multiple = items.length > 1;

    const thumbsHTML = items.map((item, index) => {
        const label = `Ver ${item.type === "video" ? "vídeo" : "foto"} ${index + 1}`;

        const content = item.type === "video"
            ? `<span class="gallery-thumb-video" aria-hidden="true">▶</span>`
            : `<img src="${escapeHTML(item.url)}" alt="" loading="lazy">`;

        return `
            <button type="button" class="gallery-thumb"
                    aria-label="${label}">
                ${content}
            </button>
        `;
    }).join("");

    return `
        <div class="gallery" id="gallery">
            <div class="product-detail-image">

                ${multiple
                    ? `<button type="button" class="gallery-arrow prev"
                               aria-label="Anterior">‹</button>`
                    : ""}

                <div class="gallery-stage" id="gallery-stage"></div>

                ${multiple
                    ? `<button type="button" class="gallery-arrow next"
                               aria-label="Próxima">›</button>
                       <span class="gallery-counter" id="gallery-counter"></span>`
                    : ""}

            </div>

            ${multiple
                ? `<div class="gallery-thumbs">${thumbsHTML}</div>`
                : ""}
        </div>
    `;
}

function setupGallery(items, productName) {
    const gallery = document.getElementById("gallery");
    const stage = document.getElementById("gallery-stage");

    if (!gallery || !stage || items.length === 0) return;

    const counter = document.getElementById("gallery-counter");
    const thumbs = Array.from(gallery.querySelectorAll(".gallery-thumb"));
    const prev = gallery.querySelector(".gallery-arrow.prev");
    const next = gallery.querySelector(".gallery-arrow.next");

    let current = 0;

    function show(index) {
        current = (index + items.length) % items.length;
        const item = items[current];

        // Trocar o conteúdo também para o vídeo que estava tocando.
        stage.replaceChildren();

        let element;

        if (item.type === "video") {
            element = document.createElement("video");
            element.src = item.url;
            element.controls = true;
            element.playsInline = true;
            element.preload = "metadata";
        } else {
            element = document.createElement("img");
            element.src = item.url;
            element.alt = `${productName} — foto ${current + 1}`;
        }

        stage.appendChild(element);

        if (counter) {
            counter.textContent = `${current + 1} / ${items.length}`;
        }

        thumbs.forEach((thumb, i) => {
            thumb.classList.toggle("active", i === current);
        });
    }

    if (prev) prev.addEventListener("click", () => show(current - 1));
    if (next) next.addEventListener("click", () => show(current + 1));

    thumbs.forEach((thumb, i) => {
        thumb.addEventListener("click", () => show(i));
    });

    // Setas do teclado.
    document.addEventListener("keydown", event => {
        if (!document.getElementById("gallery")) return;

        const tag = event.target.tagName;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

        if (event.key === "ArrowLeft") show(current - 1);
        if (event.key === "ArrowRight") show(current + 1);
    });

    // Deslizar o dedo no celular.
    let startX = null;

    stage.addEventListener("touchstart", event => {
        startX = event.changedTouches[0].clientX;
    }, { passive: true });

    stage.addEventListener("touchend", event => {
        if (startX === null) return;

        const distance = event.changedTouches[0].clientX - startX;
        startX = null;

        if (Math.abs(distance) > 40) {
            show(current + (distance < 0 ? 1 : -1));
        }
    }, { passive: true });

    show(0);
}


/* =====================================
   DETALHES DO PRODUTO
===================================== */

function loadProductPage() {
    const container = document.getElementById("product-detail");
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
    const product = products.find(item => item.id === id);

    if (!product) {
        container.innerHTML = "<h2>Produto não encontrado.</h2>";
        return;
    }

    const available = product.stock > 0;
    const name = escapeHTML(product.name);
    const description = escapeHTML(product.description);

    // Se não houver galeria, usa a foto principal como única imagem.
    const items = product.gallery && product.gallery.length > 0
        ? product.gallery
        : (product.image ? [{ url: product.image, type: "image" }] : []);

    container.innerHTML = `
        <div class="product-detail">

            ${buildGalleryHTML(items, product.name)}

            <div>
                <span class="product-detail-category">
                    ${escapeHTML(getCategoryName(product.category))}
                </span>

                <h1>${name}</h1>

                <p class="product-detail-description">${description}</p>

                <div class="product-detail-price">
                    ${formatPrice(product.price)}
                </div>

                <div class="stock ${available ? "available" : "unavailable"}">
                    ${available ? "● Produto disponível" : "● Produto esgotado"}
                </div>

                ${
                    available
                        ? `<button class="detail-button"
                                   onclick="addToCart(${product.id})">
                               ADICIONAR AO CARRINHO
                           </button>`
                        : `<button class="detail-button" disabled>
                               PRODUTO ESGOTADO
                           </button>`
                }
            </div>
        </div>
    `;

    setupGallery(items, product.name);
}


/* =====================================
   AVISO PERSONALIZADO (substitui o alert do navegador)
===================================== */

function showToast(message, options = {}) {
    const {
        type = "success",      // "success" (dourado) ou "error" (vermelho)
        actionText = "",       // texto do link, ex.: "Ver carrinho"
        actionHref = "",       // destino do link, ex.: "carrinho.html"
        duration = 3500        // tempo na tela, em milissegundos
    } = options;

    let container = document.getElementById("toast-container");

    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.setAttribute("role", "status");
        container.setAttribute("aria-live", "polite");
        document.body.appendChild(container);
    }

    // Mostra só um aviso por vez.
    clearTimeout(toastTimer);
    container.replaceChildren();

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = type === "success" ? "✓" : "!";

    // textContent evita problemas com nomes de produto.
    const text = document.createElement("span");
    text.className = "toast-text";
    text.textContent = message;

    toast.append(icon, text);

    if (actionText && actionHref) {
        const action = document.createElement("a");
        action.className = "toast-action";
        action.href = actionHref;
        action.textContent = actionText;
        toast.appendChild(action);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "Fechar aviso");
    close.textContent = "✕";
    toast.appendChild(close);

    container.appendChild(toast);

    function hideToast() {
        toast.classList.add("toast-hide");
        setTimeout(() => toast.remove(), 250);
    }

    close.addEventListener("click", hideToast);
    toastTimer = setTimeout(hideToast, duration);
}


/* =====================================
   ADICIONAR AO CARRINHO
===================================== */

function addToCart(id) {
    const product = products.find(item => item.id === Number(id));

    if (!product) {
        showToast("Produto não encontrado.", { type: "error" });
        return;
    }

    if (product.stock <= 0) {
        showToast("Este produto está esgotado.", { type: "error" });
        return;
    }

    const existing = cart.find(item => Number(item.id) === product.id);

    if (existing) {
        if (existing.quantity >= product.stock) {
            showToast("Você já adicionou todo o estoque disponível.", {
                type: "error",
                actionText: "Ver carrinho",
                actionHref: "carrinho.html"
            });
            return;
        }

        existing.quantity++;
    } else {
        cart.push({
            id: product.id,
            quantity: 1
        });
    }

    saveCart();
    updateCartCount();

    // Dá um pulinho no contador do carrinho.
    const badge = document.getElementById("cart-count");

    if (badge) {
        badge.classList.remove("cart-bump");
        void badge.offsetWidth;
        badge.classList.add("cart-bump");
    }

    showToast(`${product.name} foi adicionado ao carrinho.`, {
        actionText: "Ver carrinho",
        actionHref: "carrinho.html"
    });
}


/* =====================================
   PÁGINA DO CARRINHO
===================================== */

function loadCart() {
    const container = document.getElementById("cart-items");
    if (!container) return;

    // Só remove produtos que não existem mais se a lista carregou.
    if (products.length > 0) {
        cart = cart.filter(item =>
            products.some(product => product.id === Number(item.id))
        );
    }

    // Limita a quantidade ao estoque atual.
    cart.forEach(item => {
        const product = products.find(p => p.id === Number(item.id));
        if (!product) return;

        item.quantity = Math.min(
            Math.max(1, Number(item.quantity || 1)),
            product.stock
        );
    });

    cart = cart.filter(item => item.quantity > 0);
    saveCart();

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-item">
                <div>
                    <h3>Seu carrinho está vazio.</h3>
                    <p>Adicione produtos para fazer seu pedido.</p>
                    <br>
                    <a href="produtos.html" class="gold-button">
                        Ver produtos
                    </a>
                </div>
            </div>
        `;

        updateCartTotal();
        return;
    }

    container.innerHTML = cart.map(item => {
        const product = products.find(p => p.id === Number(item.id));
        if (!product) return "";

        const image = escapeHTML(product.image || "");
        const name = escapeHTML(product.name);

        return `
            <div class="cart-item">
                ${
                    image
                        ? `<img src="${image}" alt="${name}"
                                onerror="this.style.display='none'">`
                        : ""
                }

                <div class="cart-item-info">
                    <h3>${name}</h3>
                    <p class="cart-item-price">${formatPrice(product.price)}</p>
                </div>

                <div class="quantity-controls">
                    <button onclick="changeQuantity(${product.id}, -1)">−</button>
                    <span>${item.quantity}</span>
                    <button onclick="changeQuantity(${product.id}, 1)"
                        ${item.quantity >= product.stock ? "disabled" : ""}>+</button>
                </div>

                <button class="remove-button"
                    onclick="removeFromCart(${product.id})">
                    Remover
                </button>
            </div>
        `;
    }).join("");

    updateCartTotal();
}

function changeQuantity(id, amount) {
    const item = cart.find(item => Number(item.id) === Number(id));
    const product = products.find(product => product.id === Number(id));

    if (!item || !product) return;

    const newQuantity = item.quantity + amount;

    if (newQuantity <= 0) {
        cart = cart.filter(item => Number(item.id) !== Number(id));
    } else if (newQuantity <= product.stock) {
        item.quantity = newQuantity;
    } else {
        showToast("Você adicionou todo o estoque disponível.", { type: "error" });
    }

    saveCart();
    loadCart();
    updateCartCount();
}

function removeFromCart(id) {
    cart = cart.filter(item => Number(item.id) !== Number(id));

    saveCart();
    loadCart();
    updateCartCount();
}

function updateCartTotal() {
    const total = cart.reduce((sum, item) => {
        const product = products.find(p => p.id === Number(item.id));
        return sum + (product ? product.price * item.quantity : 0);
    }, 0);

    const element = document.getElementById("cart-total");

    if (element) {
        element.textContent = formatPrice(total);
    }
}


/* =====================================
   PEDIDO PELO WHATSAPP
===================================== */

function setupWhatsApp() {
    const button = document.getElementById("whatsapp-button");
    if (!button) return;

    button.addEventListener("click", () => {
        if (cart.length === 0) {
            showToast("Seu carrinho está vazio.", { type: "error" });
            return;
        }

        let message = "Olá! Gostaria de fazer um pedido na IM Bíblias:\n\n";
        let total = 0;

        for (const item of cart) {
            const product = products.find(p => p.id === Number(item.id));
            if (!product) continue;

            const subtotal = product.price * item.quantity;
            total += subtotal;

            message += `📖 ${product.name}\n`;
            message += `Quantidade: ${item.quantity}\n`;
            message += `Valor: ${formatPrice(subtotal)}\n\n`;
        }

        message += `💰 Total: ${formatPrice(total)}\n\n`;
        message += "Gostaria de confirmar o pedido e combinar a forma de pagamento e entrega.";

        // Confira se este é o número de WhatsApp correto da loja.
        const phone = WHATSAPP_PHONE;
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

        window.open(url, "_blank");
    });
}


/* =====================================
   FILTROS NO CELULAR (botão "Filtrar produtos")
===================================== */

function setupFilterToggle() {
    const button = document.getElementById("filter-toggle");
    const filters = document.getElementById("catalog-filters");

    // Só existe na página de produtos; nas outras páginas não faz nada.
    if (!button || !filters) return;

    button.addEventListener("click", () => {
        const isOpen = filters.classList.toggle("filters-open");

        button.setAttribute("aria-expanded", String(isOpen));

        button.innerHTML = isOpen
            ? "✕ Fechar filtros"
            : "☰ Filtrar produtos";
    });
}


/* =====================================
   INICIALIZAÇÃO
===================================== */

document.addEventListener("DOMContentLoaded", async () => {

    // O cabeçalho precisa ser montado primeiro,
    // porque a lupa e o contador do carrinho ficam dentro dele.
    setupLayout();
    setupHeaderSearch();

    setupFilters();
    setupFilterToggle();
    setupWhatsApp();

    updateCartCount();

    // Carrega produtos, destaques, catálogo, página do produto e carrinho.
    await loadProductsFromSupabase();
});