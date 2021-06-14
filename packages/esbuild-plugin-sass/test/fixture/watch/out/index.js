(() => {
  // sass:./banner.scss
  var _default = {};

  // sass:./alternate.scss
  var _default2 = {};

  // src/index.js
  customElements.define("banner-element", class BannerElement extends HTMLElement {
    static get observedAttributes() {
      return ["alt"];
    }
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.sheet = new CSSStyleSheet();
      this.sheet.replaceSync(this.getCssText());
      this.shadowRoot.adoptedStyleSheets = [this.sheet];
    }
    getCssText() {
      if (this.getAttribute("alt") === "yes") {
        return _default2;
      } else {
        return _default;
      }
    }
    connectedCallback() {
      this.shadowRoot.innerHTML = `<div class="banner"><slot></slot></div>`;
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (name === "alt") {
        if (newValue === "yes") {
          this.sheet.replaceSync(_default2);
        } else {
          this.sheet.replaceSync(_default);
        }
      }
    }
  });
})();
