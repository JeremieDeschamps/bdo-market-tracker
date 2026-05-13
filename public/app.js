const overviewNodes = {
	latestDate: document.getElementById('latestDate'),
	totalCategories: document.getElementById('totalCategories'),
	totalItems: document.getElementById('totalItems'),
	projectSize: document.getElementById('projectSize'),
	dbSize: document.getElementById('dbSize')
};

const categoriesList = document.getElementById('categoriesList');
const globalItemSearch = document.getElementById('globalItemSearch');
const refreshStatus = document.getElementById('refreshStatus');
const itemsBody = document.getElementById('itemsBody');
const itemsTitle = document.getElementById('itemsTitle');
const sortableHeaders = document.querySelectorAll('th[data-sort]');

const POLL_INTERVAL_MS = 60000;

let allCategories = [];
let selectedCategoryKey = '';
let currentItems = [];
let selectedCategory = null;
const expandedGroups = new Set();
let searchDebounceId = null;
let activeSearchController = null;
let activeSearchToken = 0;
let dashboardPollId = null;
const sortState = {
	field: null,
	direction: 'asc'
};

// Keep false to use DB labels as the single source of truth.
const USE_LOCAL_OVERRIDES = false;

// Edit this map to rename main categories in the UI.
// Same label on multiple IDs merges them under one accordion.
const MAIN_CATEGORY_LABELS = {
	// 1: 'Main Hand',
	// 5: 'Off Hand',
	// 10: 'Awakening',
	// 15: 'Armor',
	// 20: 'Accessory',
};

// Optional sub labels: MAIN -> SUB -> Name
const SUB_CATEGORY_LABELS = {
	// 1: {
	//     1: 'Longsword'
	// }
};

function formatNumber(value) {
	return Number(value || 0).toLocaleString('en-US');
}

function formatBytes(value) {
	if (value === null || value === undefined || Number.isNaN(Number(value))) {
		return '-';
	}

	const bytes = Number(value);
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	const units = ['KB', 'MB', 'GB', 'TB'];
	let size = bytes / 1024;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}

	return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatOptionalNumber(value) {
	if (value === null || value === undefined) {
		return '-';
	}

	return formatNumber(value);
}

function categoryKey(mainCategory, subCategory) {
	return `${mainCategory}-${subCategory}`;
}

function groupInfo(mainCategory) {
	const firstMatch = allCategories.find((category) => Number(category.mainCategory) === Number(mainCategory));
	const dbMainLabel = typeof firstMatch?.mainLabel === 'string' ? firstMatch.mainLabel.trim() : '';
	const mapped = dbMainLabel || (USE_LOCAL_OVERRIDES ? MAIN_CATEGORY_LABELS[mainCategory] : undefined);
	if (mapped) {
		return {
			key: `label:${mapped.toLowerCase()}`,
			title: mapped
		};
	}

	return {
		key: `main:${mainCategory}`,
		title: `Main ${mainCategory}`
	};
}
function categoryDisplayName(category) {
	const main = Number(category.mainCategory);
	const sub = Number(category.subCategory);
	const mainLabel = USE_LOCAL_OVERRIDES ? MAIN_CATEGORY_LABELS[main] : undefined;
	const dbLabel = typeof category.label === 'string' ? category.label.trim() : '';
	const subLabel = USE_LOCAL_OVERRIDES ? SUB_CATEGORY_LABELS?.[main]?.[sub] : undefined;

	if (dbLabel) {
		return dbLabel;
	}

	if (subLabel) {
		return subLabel;
	}

	if (mainLabel) {
		return `Sub ${sub}`;
	}

	return `Main ${main} / Sub ${sub}`;
}

function renderOverview(data) {
	overviewNodes.latestDate.textContent = data.latestDate || 'No data yet';
	overviewNodes.totalCategories.textContent = formatNumber(data.totalCategories);
	overviewNodes.totalItems.textContent = formatNumber(data.totalItems);
	overviewNodes.projectSize.textContent = formatBytes(data.projectSizeBytes);
	overviewNodes.dbSize.textContent = formatBytes(data.dbSizeBytes);
}

function updateRefreshStatus(message) {
	if (!refreshStatus) {
		return;
	}

	refreshStatus.textContent = message;
}

function createCategoryButton(category) {
	const button = document.createElement('button');
	button.className = 'category-btn';
	button.type = 'button';

	const key = categoryKey(category.mainCategory, category.subCategory);
	if (selectedCategoryKey === key) {
		button.classList.add('active');
	}

	button.innerHTML = `
		<strong>${categoryDisplayName(category)}</strong>
	`;

	button.addEventListener('click', () => {
		selectedCategoryKey = key;
		selectedCategory = {
			mainCategory: category.mainCategory,
			subCategory: category.subCategory
		};
		renderCategories(allCategories);
		loadItems(category.mainCategory, category.subCategory);
	});

	return button;
}

function createAccordion(group, forceOpen = false) {
	const details = document.createElement('details');
	details.className = 'main-accordion';

	const hasSelected = group.categories.some((category) => categoryKey(category.mainCategory, category.subCategory) === selectedCategoryKey);
	if (forceOpen || hasSelected || expandedGroups.has(group.key)) {
		details.open = true;
	}

	const summary = document.createElement('summary');
	const itemCount = group.categories.reduce((sum, category) => sum + Number(category.itemCount || 0), 0);
	summary.innerHTML = `
		<span class="accordion-title">${group.title}</span>
		<span class="accordion-meta">${formatNumber(itemCount)} items</span>
	`;

	const content = document.createElement('div');
	content.className = 'accordion-content';
	for (const category of group.categories) {
		content.appendChild(createCategoryButton(category));
	}

	details.appendChild(summary);
	details.appendChild(content);

	details.addEventListener('toggle', () => {
		if (details.open) {
			expandedGroups.add(group.key);
		} else {
			expandedGroups.delete(group.key);
		}
	});

	return details;
}

function renderCategories(categories) {
	categoriesList.innerHTML = '';

	if (!categories.length) {
		categoriesList.innerHTML = '<p class="empty-state">No categories found for the latest snapshot.</p>';
		return;
	}

	const filteredCategories = categories;

	const groups = new Map();
	for (const category of filteredCategories) {
		const info = groupInfo(Number(category.mainCategory));
		if (!groups.has(info.key)) {
			groups.set(info.key, {
				key: info.key,
				title: info.title,
				categories: []
			});
		}
		groups.get(info.key).categories.push(category);
	}

	for (const group of groups.values()) {
		group.categories.sort((a, b) => {
			if (a.mainCategory !== b.mainCategory) {
				return a.mainCategory - b.mainCategory;
			}
			return a.subCategory - b.subCategory;
		});
		categoriesList.appendChild(createAccordion(group, false));
	}
}

function renderItems(items) {
	itemsBody.innerHTML = '';

	if (!items.length) {
		itemsBody.innerHTML = '<tr><td class="empty-state" colspan="6">No items available in this category.</td></tr>';
		return;
	}

	for (const item of items) {
		const row = document.createElement('tr');
		row.innerHTML = `
			<td>${item.itemId}</td>
			<td>${item.name}</td>
			<td>${formatNumber(item.price)}</td>
			<td>${formatOptionalNumber(item.minPrice)}</td>
			<td>${formatOptionalNumber(item.maxPrice)}</td>
			<td>${formatNumber(item.stock)}</td>
		`;
		itemsBody.appendChild(row);
	}
}

function getSortedItems(items) {
	if (!sortState.field) {
		return items;
	}

	const factor = sortState.direction === 'asc' ? 1 : -1;
	return [...items].sort((a, b) => {
		if (sortState.field === 'name') {
			const nameA = String(a.name || '').toLowerCase();
			const nameB = String(b.name || '').toLowerCase();
			return nameA.localeCompare(nameB) * factor;
		}

		const valueA = Number(a[sortState.field] || 0);
		const valueB = Number(b[sortState.field] || 0);
		return (valueA - valueB) * factor;
	});
}

function updateSortHeaderIndicators() {
	for (const header of sortableHeaders) {
		const field = header.dataset.sort;
		if (!field) {
			continue;
		}

		let baseText = 'Stock';
		if (field === 'name') {
			baseText = 'Name';
		} else if (field === 'price') {
			baseText = 'Price';
		}

		if (sortState.field !== field) {
			header.textContent = baseText;
			continue;
		}

		header.textContent = `${baseText} ${sortState.direction === 'asc' ? '↑' : '↓'}`;
	}
}

function applyItemFilters() {
	if (!currentItems.length) {
		renderItems([]);
		return;
	}

	renderItems(getSortedItems(currentItems));
}

async function loadItems(mainCategory, subCategory) {
	selectedCategory = { mainCategory, subCategory };
	itemsTitle.textContent = `Items in ${categoryDisplayName({ mainCategory, subCategory })}`;
	itemsBody.innerHTML = '<tr><td class="empty-state" colspan="6">Loading items...</td></tr>';

	const response = await fetch(`/api/categories/${mainCategory}/${subCategory}/items`);
	currentItems = await response.json();
	applyItemFilters();
}

async function searchItemsGloballyByName() {
	const query = globalItemSearch.value.trim();
	activeSearchToken += 1;
	const localToken = activeSearchToken;

	if (activeSearchController) {
		activeSearchController.abort();
		activeSearchController = null;
	}

	if (!query) {
		itemsTitle.textContent = 'Select a category';
		currentItems = [];
		activeSearchToken += 1;
		renderItems([]);
		if (selectedCategory) {
			await loadItems(selectedCategory.mainCategory, selectedCategory.subCategory);
		}
		return;
	}

	itemsTitle.textContent = `Search results for "${query}"`;
	itemsBody.innerHTML = '<tr><td class="empty-state" colspan="6">Searching items...</td></tr>';

	const controller = new AbortController();
	activeSearchController = controller;

	try {
		const response = await fetch(`/api/items/search?name=${encodeURIComponent(query)}&limit=1000`, {
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`Search API failed (${response.status})`);
		}

		if (localToken !== activeSearchToken) {
			return;
		}

		currentItems = await response.json();
		applyItemFilters();
	} catch (error) {
		if (error.name === 'AbortError') {
			return;
		}

		console.error(error);
		itemsTitle.textContent = 'Search unavailable';
		itemsBody.innerHTML = '<tr><td class="empty-state" colspan="6">Search failed. Restart UI server and retry.</td></tr>';
	} finally {
		if (activeSearchController === controller) {
			activeSearchController = null;
		}
	}
}

async function loadDashboard() {
	const [overviewRes, categoriesRes] = await Promise.all([
		fetch('/api/overview'),
		fetch('/api/categories')
	]);

	const overview = await overviewRes.json();
	const categories = await categoriesRes.json();

	renderOverview(overview);

	allCategories = categories;

	renderCategories(allCategories);
}

async function refreshVisibleData() {
	const query = globalItemSearch.value.trim();

	await loadDashboard();

	if (query) {
		await searchItemsGloballyByName();
	} else if (selectedCategory) {
		await loadItems(selectedCategory.mainCategory, selectedCategory.subCategory);
	}

	updateRefreshStatus(`Last refresh: ${new Date().toLocaleTimeString()} | Auto-refresh every 60s`);
}

function startPolling() {
	if (dashboardPollId) {
		clearInterval(dashboardPollId);
	}

	dashboardPollId = setInterval(async () => {
		try {
			await refreshVisibleData();
		} catch (error) {
			console.error(error);
			updateRefreshStatus('Auto-refresh failed. Check server logs and retry.');
		}
	}, POLL_INTERVAL_MS);
}
globalItemSearch.addEventListener('input', () => {
	if (searchDebounceId) {
		clearTimeout(searchDebounceId);
	}

	searchDebounceId = setTimeout(() => {
		searchItemsGloballyByName();
	}, 300);
});

for (const header of sortableHeaders) {
	header.addEventListener('click', () => {
		const field = header.dataset.sort;
		if (!field) {
			return;
		}

		if (sortState.field === field) {
			sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
		} else {
			sortState.field = field;
			sortState.direction = field === 'name' ? 'asc' : 'desc';
		}

		updateSortHeaderIndicators();
		applyItemFilters();
	});
}

updateSortHeaderIndicators();

try {
	await loadDashboard();
	updateRefreshStatus(`Last refresh: ${new Date().toLocaleTimeString()} | Auto-refresh every 60s`);
	startPolling();
} catch (error) {
	console.error(error);
	itemsTitle.textContent = 'Unable to load dashboard data';
	categoriesList.innerHTML = '<p class="empty-state">Check server logs and verify that the database has data.</p>';
	itemsBody.innerHTML = '<tr><td class="empty-state" colspan="6">Unable to load data.</td></tr>';
	updateRefreshStatus('Auto-refresh unavailable until dashboard loads successfully.');
}
