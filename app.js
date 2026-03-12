// === State Management ===
const Storage = {
    // Initial customers
    customers: [
        { id: 'kh01', name: 'Daiwa' },
        { id: 'kh02', name: 'Khác' }
    ],

    getListsByCustomer(customerId) {
        const lists = localStorage.getItem(`lists_${customerId}`);
        return lists ? JSON.parse(lists) : [];
    },

    saveList(customerId, listName) {
        const lists = this.getListsByCustomer(customerId);
        const newList = {
            id: 'list_' + Date.now(),
            name: listName,
            createdAt: new Date().toISOString(),
            items: [] // Array of scanned QR texts
        };
        lists.push(newList);
        localStorage.setItem(`lists_${customerId}`, JSON.stringify(lists));
        return newList;
    },

    getList(customerId, listId) {
        const lists = this.getListsByCustomer(customerId);
        return lists.find(l => l.id === listId);
    },

    saveScanItem(customerId, listId, scannedText) {
        const lists = this.getListsByCustomer(customerId);
        const listIndex = lists.findIndex(l => l.id === listId);

        if (listIndex > -1) {
            // Check for duplicate
            if (lists[listIndex].items.includes(scannedText)) {
                return false; // Duplicate found
            }
            lists[listIndex].items.push(scannedText);
            localStorage.setItem(`lists_${customerId}`, JSON.stringify(lists));
            return true; // Successfully saved
        }
        return false;
    }
};

// === UI Components & Views ===
const appDiv = document.getElementById('app');
const alertModal = document.getElementById('alert-modal');
const alertCloseBtn = document.getElementById('alert-close-btn');

alertCloseBtn.addEventListener('click', () => {
    alertModal.classList.add('hidden');
    // If scanner is paused due to alert, resume it (handled in scanner logic)
});

function showAlert(title, message) {
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    alertModal.classList.remove('hidden');
}

// 1. Home View
function renderHome() {
    appDiv.innerHTML = `
        <div class="view-enter" style="display: flex; flex-direction: column; justify-content: center; flex-grow: 1;">
            <h1>Daiwa Scanner</h1>
            <p class="subtitle">Chọn khách hàng để bắt đầu</p>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                ${Storage.customers.map(customer => `
                    <button class="btn btn-primary glass-panel w-full" style="padding: 16px; font-size: 1.1rem;" onclick="location.hash='#/customer/${customer.id}'">
                        ${customer.name}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

// 2. Customer View (List of Lists & Create Form)
function renderCustomer(customerId) {
    const customer = Storage.customers.find(c => c.id === customerId);
    if (!customer) {
        location.hash = '#/';
        return;
    }

    const lists = Storage.getListsByCustomer(customerId);

    appDiv.innerHTML = `
        <div class="view-enter">
            <button class="btn btn-back" onclick="location.hash='#/'">
                &larr; Quay lại
            </button>
            <h2>${customer.name}</h2>
            
            <form id="createListForm" class="glass-panel" style="padding: 20px; margin-bottom: 24px;">
                <div class="form-group">
                    <label class="form-label">Tên danh sách mới</label>
                    <input type="text" id="listNameInput" class="form-input" placeholder="Nhập tên (VD: Lô hàng A)..." required>
                </div>
                <button type="submit" class="btn btn-primary w-full">Tạo Danh Sách</button>
            </form>

            <div class="header-flex">
                <h3 style="font-size: 1.1rem; color: var(--text-primary);">Danh sách đã tạo</h3>
                <span class="badge">${lists.length}</span>
            </div>

            <div class="list-container" id="listsContainer">
                ${lists.length === 0 ? '<p class="empty-state">Chưa có danh sách nào.</p>' : ''}
                ${lists.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(list => `
                    <div class="glass-panel list-item" onclick="location.hash='#/customer/${customerId}/list/${list.id}'">
                        <div class="list-item-content">
                            <h3>${list.name}</h3>
                            <p>${list.items.length} mã đã quét</p>
                        </div>
                        <div class="list-item-arrow">&rarr;</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    document.getElementById('createListForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('listNameInput');
        const listName = input.value.trim();
        if (listName) {
            Storage.saveList(customerId, listName);
            renderCustomer(customerId); // Re-render to show new list
        }
    });
}

// 3. List View & Scanner
let html5QrCode = null;

function renderList(customerId, listId) {
    const list = Storage.getList(customerId, listId);
    if (!list) {
        location.hash = `#/customer/${customerId}`;
        return;
    }

    appDiv.innerHTML = `
        <div class="view-enter" style="display: flex; flex-direction: column; height: 100%;">
            <button class="btn btn-back" onclick="location.hash='#/customer/${customerId}'">
                &larr; Quay lại
            </button>
            
            <div class="header-flex">
                <h2 style="margin: 0;">${list.name}</h2>
                <span class="badge">${list.items.length} mã</span>
            </div>

            <!-- Scanner Area -->
            <div id="scannerSection" style="display: none;">
                <div id="qr-reader"></div>
                
                <div class="camera-controls">
                     <div class="control-row" id="zoomControlRow" style="display: none;">
                        <span style="font-size: 0.8rem;">Zoom</span>
                        <div class="zoom-slider-container">
                             <input type="range" id="zoomSlider" class="zoom-slider" min="1" max="5" step="0.1" value="1">
                        </div>
                     </div>
                     <div class="control-row">
                         <button id="toggleFlashBtn" class="btn btn-warning" style="flex: 1; display: none;">💡 Bật Đèn</button>
                         <button id="stopScanBtn" class="btn btn-danger" style="flex: 1;">X Đóng Camera</button>
                     </div>
                </div>
            </div>

            <button id="startScanBtn" class="btn btn-primary w-full btn-icon" style="justify-content: center; padding: 16px; margin-bottom: 1rem;">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
                Quét Mã QR
            </button>

            <!-- Scanned Items -->
            <div class="scanned-items" id="scannedItemsList">
                 ${list.items.length === 0 ? '<p class="empty-state">Chưa quét mã nào.</p>' : ''}
                 ${[...list.items].reverse().map(item => `
                     <div class="scanned-item">${item}</div>
                 `).join('')}
            </div>
        </div>
    `;

    // Scanner Logic
    const startScanBtn = document.getElementById('startScanBtn');
    const stopScanBtn = document.getElementById('stopScanBtn');
    const toggleFlashBtn = document.getElementById('toggleFlashBtn');
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomControlRow = document.getElementById('zoomControlRow');
    const scannerSection = document.getElementById('scannerSection');

    // Prevent multiple rapid scans of the same code
    let lastScannedText = null;
    let isScanning = false;
    let flashOn = false;
    let currentTrack = null; // Store reference to the video track

    function renderScannedItems() {
        const currentList = Storage.getList(customerId, listId);
        const listDiv = document.getElementById('scannedItemsList');
        const badgeSpan = document.querySelector('.badge');

        badgeSpan.innerText = `${currentList.items.length} mã`;

        if (currentList.items.length === 0) {
            listDiv.innerHTML = '<p class="empty-state">Chưa quét mã nào.</p>';
        } else {
            listDiv.innerHTML = [...currentList.items].reverse().map(item => `
                <div class="scanned-item">${item}</div>
            `).join('');
        }
    }

    // Safely applying constraints to the live running video track
    async function applyVideoConstraints(constraints) {
        if (currentTrack && typeof currentTrack.applyConstraints === 'function') {
            try {
                // Merge new constraints with the existing ones
                await currentTrack.applyConstraints({
                    advanced: [constraints]
                });
            } catch (err) {
                console.warn("Lỗi khi áp dụng constraint camera", err);
            }
        }
    }

    async function startScanner() {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("qr-reader");
        }

        scannerSection.style.display = 'block';
        startScanBtn.style.display = 'none';

        // Basic config that is safe for almost all devices
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        try {
            await html5QrCode.start(
                { facingMode: "environment" }, // Prefer back camera
                config,
                (decodedText, decodedResult) => {
                    // Success callback
                    if (decodedText !== lastScannedText) {
                        lastScannedText = decodedText;

                        // Check if alert modal is open, if so ignore scans
                        if (!alertModal.classList.contains('hidden')) return;

                        html5QrCode.pause(true); // Pause scanning while prompt is up

                        // Small timeout to prevent UI thread lock
                        setTimeout(() => {
                            if (confirm(`Mã QR: ${decodedText}\nBạn có muốn lưu?`)) {
                                const saved = Storage.saveScanItem(customerId, listId, decodedText);
                                if (!saved) {
                                    // Duplicate
                                    showAlert("Cảnh báo", "Nội dung mã QR này đã có trong danh sách. Không thể lưu trùng lặp.");
                                } else {
                                    // Success update UI
                                    renderScannedItems();
                                }
                            }

                            // Resume scanning
                            lastScannedText = null; // reset to allow scanning same code again if rejected previously
                            html5QrCode.resume();
                        }, 100);
                    }
                },
                (errorMessage) => {
                    // Parse error, ignore
                }
            );
            
            isScanning = true;
            flashOn = false;
            
            // Lấy MediaStreamTrack trực tiếp từ video element
            const videoElem = document.querySelector("#qr-reader video");
            if (videoElem && videoElem.srcObject) {
                currentTrack = videoElem.srcObject.getVideoTracks()[0];
                
                if (currentTrack) {
                    const capabilities = currentTrack.getCapabilities ? currentTrack.getCapabilities() : {};
                    const settings = currentTrack.getSettings ? currentTrack.getSettings() : {};

                    // Cài đặt hiển thị Zoom UI
                    if (capabilities.zoom) {
                        zoomSlider.min = capabilities.zoom.min || 1;
                        zoomSlider.max = capabilities.zoom.max || 5;
                        zoomSlider.step = capabilities.zoom.step || 0.1;
                        zoomSlider.value = settings.zoom || 1;
                        zoomControlRow.style.display = 'flex';
                    } else {
                        zoomControlRow.style.display = 'none';
                    }

                    // Cài đặt hiển thị Flash UI
                    if (capabilities.torch) {
                        toggleFlashBtn.style.display = 'block';
                        toggleFlashBtn.innerText = "💡 Bật Đèn";
                    } else {
                        toggleFlashBtn.style.display = 'none';
                    }
                }
            }
            
        } catch (err) {
            console.error("Lỗi khi mở camera", err);
            alert("Không thể mở camera. Vui lòng cấp quyền.");
            stopScanner();
        }
    }

    zoomSlider.addEventListener('input', (e) => {
        const zoomValue = parseFloat(e.target.value);
        if (currentTrack) {
            applyVideoConstraints({ zoom: zoomValue });
        }
    });

    toggleFlashBtn.addEventListener('click', () => {
        if (currentTrack) {
            flashOn = !flashOn;
            applyVideoConstraints({ torch: flashOn });
            toggleFlashBtn.innerText = flashOn ? "💡 Tắt Đèn" : "💡 Bật Đèn";
        }
    });

    async function stopScanner() {
        if (html5QrCode && isScanning) {
            try {
                await html5QrCode.stop();
                isScanning = false;
                currentTrack = null;
            } catch (err) {
                console.error("Error stopping scanner", err);
            }
        }
        scannerSection.style.display = 'none';
        startScanBtn.style.display = 'flex';
    }

    startScanBtn.addEventListener('click', startScanner);
    stopScanBtn.addEventListener('click', stopScanner);

    // Cleanup scanner when leaving view
    window.addEventListener('hashchange', stopScanner, { once: true });
}

// === Router ===
function router() {
    const hash = location.hash || '#/';
    appDiv.innerHTML = ''; // Clear current

    if (hash === '#/') {
        renderHome();
    } else if (hash.startsWith('#/customer/')) {
        const parts = hash.split('/');
        if (parts.length === 3) {
            renderCustomer(parts[2]);
        } else if (parts.length === 5 && parts[3] === 'list') {
            renderList(parts[2], parts[4]);
        } else {
            location.hash = '#/';
        }
    } else {
        location.hash = '#/';
    }
}

// Init
window.addEventListener('hashchange', router);
router(); // Run on load
