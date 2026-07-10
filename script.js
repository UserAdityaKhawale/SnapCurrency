import { currencyToFlagCode } from "./currency-to-flag-code.js";

const inputAmount = document.getElementById("inputSourceCurrency");
const sourceSelect = document.getElementById("selectSourceCurrency");
const targetSelect = document.getElementById("selectTargetCurrency");
const sourceImage = document.getElementById("imageSourceCurrency");
const targetImage = document.getElementById("imageTargetCurrency");
const sourceSearch = document.getElementById("searchSource");
const targetSearch = document.getElementById("searchTarget");
const convertButton = document.getElementById("buttonConvert");
const swapButton = document.getElementById("swapButton");
const resultText = document.getElementById("resultText");
const inputTargetCurrency = document.getElementById("inputTargetCurrency");
const sourceLabel = document.getElementById("sourceLabel");
const targetLabel = document.getElementById("targetLabel");
const exchangeRateText = document.getElementById("exchangeRateText");
const loader = document.getElementById("loader");
const errorMessage = document.getElementById("errorMessage");
const copyButton = document.getElementById("copyResult");
const historyList = document.getElementById("historyList");
const lastUpdated = document.getElementById("lastUpdated");
const themeToggle = document.getElementById("themeToggle");
const favoriteSource = document.getElementById("favoriteSource");
const favoriteTarget = document.getElementById("favoriteTarget");

const DEFAULT_SOURCE = "USD";
const DEFAULT_TARGET = "INR";
const API_URL = "https://open.er-api.com/v6/latest";
const CACHE_KEY = "exchangeRateCache";
const CACHE_TTL = 30 * 60 * 1000;
const FAVORITES_KEY = "favoriteCurrencies";
const HISTORY_KEY = "conversionHistory";
const FALLBACK_UPDATED_AT = "Offline fallback rates";
const FALLBACK_USD_RATES = {
  USD: 1,
  INR: 83.5,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157.5,
  AUD: 1.5,
  CAD: 1.37,
  CHF: 0.9,
  CNY: 7.25,
  AED: 3.67,
  SAR: 3.75,
  SGD: 1.35,
  NZD: 1.63,
  ZAR: 18.1,
  BRL: 5.45,
  MXN: 18.2,
  KRW: 1380,
  IDR: 16250,
  THB: 36.6,
  MYR: 4.7,
  PHP: 58.5,
  PKR: 278,
  BDT: 117,
  NPR: 133.6,
  LKR: 305,
};

let latestRates = {};
let latestBase = "";
let latestUpdatedAt = "";
let latestIsFallback = false;
let useFallbackUntil = 0;
let activeRequest = null;
let requestSerial = 0;
let convertTimer = null;
let history = readJson(HISTORY_KEY, []);
let favorites = readJson(FAVORITES_KEY, []);

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function populateCurrencies() {
  const fragmentSource = document.createDocumentFragment();
  const fragmentTarget = document.createDocumentFragment();

  Object.keys(currencyToFlagCode)
    .sort()
    .forEach((currency) => {
      fragmentSource.appendChild(new Option(currency, currency));
      fragmentTarget.appendChild(new Option(currency, currency));
    });

  sourceSelect.replaceChildren(fragmentSource);
  targetSelect.replaceChildren(fragmentTarget);
  
  setupCustomDropdown("Source");
  setupCustomDropdown("Target");
}

function setupCustomDropdown(type) {
  const select = document.getElementById(`select${type}Currency`);
  const trigger = document.getElementById(`trigger${type}`);
  const display = document.getElementById(`display${type}`);
  const dropdown = document.getElementById(`dropdown${type}`);
  const optionsList = document.getElementById(`options${type}`);
  const search = document.getElementById(`search${type}`);
  const image = document.getElementById(`image${type}Currency`);
  const label = document.getElementById(`${type.toLowerCase()}Label`);

  optionsList.innerHTML = "";
  Object.keys(currencyToFlagCode).sort().forEach(currency => {
    const li = document.createElement("li");
    li.textContent = currency;
    li.dataset.value = currency;
    li.addEventListener("click", () => {
      select.value = currency;
      display.textContent = currency;
      dropdown.classList.add("hidden");
      updateSelectedCurrency(select, image, label);
      
      Array.from(optionsList.children).forEach(child => child.classList.remove("active"));
      li.classList.add("active");
    });
    optionsList.appendChild(li);
  });

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
    if (!dropdown.classList.contains("hidden")) {
      search.focus();
      search.value = "";
      filterCustomList(search, optionsList);
    }
  });

  search.addEventListener("input", () => filterCustomList(search, optionsList));
  
  document.addEventListener("click", (e) => {
    if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });
}

function filterCustomList(input, list) {
  const value = input.value.trim().toUpperCase();
  Array.from(list.children).forEach(li => {
    li.classList.toggle("hidden", value !== "" && !li.dataset.value.includes(value));
  });
}

function loadSelection() {
  const savedSource = localStorage.getItem("sourceCurrency") || DEFAULT_SOURCE;
  const savedTarget = localStorage.getItem("targetCurrency") || DEFAULT_TARGET;

  sourceSelect.value = currencyToFlagCode[savedSource] ? savedSource : DEFAULT_SOURCE;
  targetSelect.value = currencyToFlagCode[savedTarget] ? savedTarget : DEFAULT_TARGET;
  
  document.getElementById("displaySource").textContent = sourceSelect.value;
  document.getElementById("displayTarget").textContent = targetSelect.value;
}

function saveSelection() {
  localStorage.setItem("sourceCurrency", sourceSelect.value);
  localStorage.setItem("targetCurrency", targetSelect.value);
}

function updateFlag(selectElement, imageElement) {
  const flagCode = currencyToFlagCode[selectElement.value];

  imageElement.src = flagCode
    ? `https://flagcdn.com/48x36/${flagCode}.png`
    : "https://flagcdn.com/48x36/un.png";
  imageElement.alt = selectElement.value;
}

function updateSelectedCurrency(selectElement, imageElement, labelElement) {
  updateFlag(selectElement, imageElement);
  if (labelElement) {
    labelElement.textContent = selectElement.value;
  }
  saveSelection();
  updateFavoriteButtons();
  convertCurrency();
}

function filterCurrencies(input, select) {
  const value = input.value.trim().toUpperCase();

  Array.from(select.options).forEach((option) => {
    option.hidden = value !== "" && !option.value.includes(value);
  });
}

function applyTheme(theme) {
  const isLight = theme === "light";

  document.body.classList.toggle("light", isLight);
  themeToggle.innerHTML = isLight ? "&#9788;" : "&#9790;";
}

function showLoader() {
  loader.classList.remove("hidden");
  convertButton.disabled = true;
}

function hideLoader() {
  loader.classList.add("hidden");
  convertButton.disabled = false;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.style.display = "none";
}

function formatNumber(number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(number);
}

function updateExchangeRate(rate) {
  exchangeRateText.textContent = `1 ${sourceSelect.value} = ${formatNumber(rate)} ${targetSelect.value}`;
}

function getCachedRates(baseCurrency) {
  const cache = readJson(CACHE_KEY, {});
  const cached = cache[baseCurrency];

  if (!cached || Date.now() - cached.savedAt > CACHE_TTL) {
    return null;
  }

  return cached;
}

function saveCachedRates(baseCurrency, data) {
  const cache = readJson(CACHE_KEY, {});

  cache[baseCurrency] = {
    base: data.base_code,
    rates: data.rates,
    savedAt: Date.now(),
    updatedAt: data.time_last_update_utc || new Date().toUTCString(),
  };

  writeJson(CACHE_KEY, cache);
}

function getFallbackRates(baseCurrency) {
  const baseRate = FALLBACK_USD_RATES[baseCurrency];

  if (!baseRate) {
    return null;
  }

  return {
    base: baseCurrency,
    fallback: true,
    rates: Object.fromEntries(
      Object.entries(FALLBACK_USD_RATES).map(([currency, usdRate]) => [
        currency,
        usdRate / baseRate,
      ]),
    ),
    updatedAt: FALLBACK_UPDATED_AT,
  };
}

function activateFallbackRates(baseCurrency) {
  const fallback = getFallbackRates(baseCurrency);

  if (!fallback) {
    return null;
  }

  latestBase = fallback.base;
  latestRates = fallback.rates;
  latestUpdatedAt = fallback.updatedAt;
  latestIsFallback = true;
  useFallbackUntil = Date.now() + CACHE_TTL;
  lastUpdated.textContent = `Last Updated: ${FALLBACK_UPDATED_AT}`;

  return fallback;
}

async function fetchRates(baseCurrency) {
  if (latestBase === baseCurrency && latestRates[baseCurrency] === 1) {
    return {
      base: latestBase,
      fallback: latestIsFallback,
      rates: latestRates,
      updatedAt: latestUpdatedAt,
    };
  }

  if (Date.now() < useFallbackUntil) {
    return activateFallbackRates(baseCurrency);
  }

  const cached = getCachedRates(baseCurrency);

  if (cached) {
    latestBase = cached.base;
    latestRates = cached.rates;
    latestUpdatedAt = cached.updatedAt;
    latestIsFallback = false;
    lastUpdated.textContent = `Last Updated: ${new Date(cached.updatedAt).toLocaleString()}`;
    return cached;
  }

  if (activeRequest) {
    activeRequest.abort();
  }

  const currentRequest = new AbortController();
  const currentSerial = requestSerial + 1;

  activeRequest = currentRequest;
  requestSerial = currentSerial;

  const timeoutId = setTimeout(() => currentRequest.abort(), 10000);

  try {
    clearError();
    showLoader();

    const response = await fetch(`${API_URL}/${baseCurrency}`, {
      signal: currentRequest.signal,
    });

    if (!response.ok) {
      throw new Error("Unable to fetch exchange rates. Please try again.");
    }

    const data = await response.json();

    if (data.result !== "success" || !data.rates) {
      throw new Error("Exchange rate service is unavailable right now.");
    }

    if (currentSerial !== requestSerial) {
      return null;
    }

    latestBase = data.base_code;
    latestRates = data.rates;
    latestUpdatedAt = data.time_last_update_utc;
    latestIsFallback = false;
    useFallbackUntil = 0;
    lastUpdated.textContent = `Last Updated: ${new Date(data.time_last_update_utc).toLocaleString()}`;

    saveCachedRates(baseCurrency, data);

    return {
      base: data.base_code,
      rates: data.rates,
      updatedAt: data.time_last_update_utc,
    };
  } catch (error) {
    if (currentSerial !== requestSerial) {
      return null;
    }

    const fallback = activateFallbackRates(baseCurrency);

    if (fallback) {
      showError("Live rates unavailable. Using offline fallback rates.");
      return fallback;
    }

    showError(
      error.name === "AbortError"
        ? "Exchange rate request timed out. Check your connection and try again."
        : error.message,
    );

    return null;
  } finally {
    clearTimeout(timeoutId);

    if (currentSerial === requestSerial) {
      activeRequest = null;
      hideLoader();
    }
  }
}

async function convertCurrency() {
  const amount = Number(inputAmount.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    showError("Please enter a valid amount greater than 0.");
    resultText.textContent = "Converted Amount";
    return;
  }

  const source = sourceSelect.value;
  const target = targetSelect.value;
  const data = await fetchRates(source);

  if (!data) {
    resultText.textContent = "Converted Amount";
    return;
  }

  const rate = data.rates[target];

  if (typeof rate !== "number") {
    showError(`Exchange rate not found for ${target}.`);
    resultText.textContent = "Converted Amount";
    return;
  }

  if (!data.fallback) {
    clearError();
  }

  const convertedAmount = amount * rate;

  resultText.textContent = `${formatNumber(convertedAmount)} ${target}`;
  if (inputTargetCurrency) {
    inputTargetCurrency.value = convertedAmount.toFixed(2);
  }
  updateExchangeRate(rate);
  addToHistory(amount, source, convertedAmount, target);
}

function scheduleConversion() {
  clearTimeout(convertTimer);
  convertTimer = setTimeout(convertCurrency, 300);
}

function swapCurrencies() {
  const source = sourceSelect.value;

  sourceSelect.value = targetSelect.value;
  targetSelect.value = source;

  document.getElementById("displaySource").textContent = sourceSelect.value;
  document.getElementById("displayTarget").textContent = targetSelect.value;

  updateFlag(sourceSelect, sourceImage);
  updateFlag(targetSelect, targetImage);
  saveSelection();
  updateFavoriteButtons();
  convertCurrency();
}

async function copyResult() {
  const text = resultText.textContent.trim();

  if (text === "" || text === "Converted Amount") {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);

    const original = copyButton.innerHTML;
    copyButton.textContent = "Copied";

    setTimeout(() => {
      copyButton.innerHTML = original;
    }, 1800);
  } catch {
    showError("Failed to copy the result.");
  }
}

function renderHistory() {
  historyList.innerHTML = "";

  if (history.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No recent conversions.";
    historyList.appendChild(emptyItem);
    return;
  }

  history.forEach((item) => {
    const li = document.createElement("li");
    const conversion = document.createElement("strong");
    const result = document.createElement("strong");
    const small = document.createElement("small");

    conversion.textContent = `${item.amount} ${item.source}`;
    result.textContent = `${item.result} ${item.target}`;
    small.textContent = item.time;

    li.append(conversion, " -> ", result, document.createElement("br"), small);
    historyList.appendChild(li);
  });
}

function addToHistory(amount, source, result, target) {
  const entry = {
    amount: formatNumber(amount),
    source,
    result: formatNumber(result),
    target,
    time: new Date().toLocaleString(),
  };

  const duplicate = history[0];

  if (
    duplicate &&
    duplicate.amount === entry.amount &&
    duplicate.source === entry.source &&
    duplicate.result === entry.result &&
    duplicate.target === entry.target
  ) {
    return;
  }

  history.unshift(entry);
  history = history.slice(0, 10);
  writeJson(HISTORY_KEY, history);
  renderHistory();
}

function saveFavorites() {
  writeJson(FAVORITES_KEY, favorites);
}

function toggleFavorite(currency) {
  if (favorites.includes(currency)) {
    favorites = favorites.filter((item) => item !== currency);
  } else {
    favorites.push(currency);
  }

  saveFavorites();
  updateFavoriteButtons();
}

function updateFavoriteButtons() {
  favoriteSource.textContent = favorites.includes(sourceSelect.value) ? "\u2B50" : "\u2606";
  favoriteTarget.textContent = favorites.includes(targetSelect.value) ? "\u2B50" : "\u2606";
}

function initializeApp() {
  populateCurrencies();
  loadSelection();
  updateFlag(sourceSelect, sourceImage);
  updateFlag(targetSelect, targetImage);
  applyTheme(localStorage.getItem("theme"));
  updateFavoriteButtons();
  renderHistory();
  convertCurrency();
}

sourceSearch.addEventListener("input", () => filterCurrencies(sourceSearch, sourceSelect));
targetSearch.addEventListener("input", () => filterCurrencies(targetSearch, targetSelect));

sourceSelect.addEventListener("change", () => updateSelectedCurrency(sourceSelect, sourceImage, sourceLabel));
targetSelect.addEventListener("change", () => updateSelectedCurrency(targetSelect, targetImage, targetLabel));

themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("light") ? "dark" : "light";

  localStorage.setItem("theme", nextTheme);
  applyTheme(nextTheme);
});

inputAmount.addEventListener("input", scheduleConversion);
inputAmount.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    clearTimeout(convertTimer);
    convertCurrency();
  }
});

convertButton.addEventListener("click", convertCurrency);
swapButton.addEventListener("click", swapCurrencies);
copyButton.addEventListener("click", copyResult);
favoriteSource.addEventListener("click", () => toggleFavorite(sourceSelect.value));
favoriteTarget.addEventListener("click", () => toggleFavorite(targetSelect.value));

setInterval(convertCurrency, CACHE_TTL);

window.addEventListener("error", (event) => {
  console.error(event.error);
  showError("Something went wrong. Please refresh the page.");
});

window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  showError("Network request failed. Please try again.");
});

initializeApp();
