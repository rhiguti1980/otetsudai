import React from "react";
import { createRoot } from "react-dom/client";
import App from "../otetsudai.jsx";

// window.storage は Claude artifact 専用 API のため、
// ローカル開発では localStorage で代替する
if (!window.storage) {
  window.storage = {
    get: async (key) => {
      const value = localStorage.getItem(key);
      return value !== null ? { value } : null;
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
    },
  };
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
