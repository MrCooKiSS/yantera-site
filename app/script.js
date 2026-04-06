// const BASE_URL_WS = "ws://localhost:8080";
// const BASE_URL = `http://localhost:8080`;
const BASE_URL_WS = `wss://${window.location.host}/app`;
const BASE_URL = `https://${window.location.host}/app`;
const LOGIN_PAGE = "/index.html";

// Глобальные переменные
class ReconnectableWebSocket {
    constructor(options = {}) {
        // Параметры переподключения
        this.reconnectDelay = 1000;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.maxDelay = options.maxDelay || 30000;
    }
}

let currentUser = null;
let currentUserId = null;
let wsConnection = null;
let rouletteWS = null;
let tempChatWS = null;
let activeChatWebSockets = {}; // room_id -> WebSocket
let currentRoomId = null;
let currentPartnerId = null;
let currentPartner = null;


/*
------------------------------------
         ОСНОВНЫЕ ФУНКЦИИ
------------------------------------
*/


async function apiFetch(path, options = {}) {
    try {
        const res = await fetch(BASE_URL + path, {
            credentials: "include",
            ...options
        });
    
        let data = null;
        try {
            data = await res.json();
        } catch (_) {
        }
    
        if (!res.ok) {
            const msg = data && data.detail ? data.detail : `Ошибка ${res.status}`;
            if (res.status == 401 || e.message.includes('Unauthorized') || e.message.includes('authentication') || e.message.includes('401')) {
                setTimeout(() => {
                    window.location.href = LOGIN_PAGE;
                }, 1000);
                return
            }
            throw new Error(msg);
        }
        return data;
    } catch (e) {
        console.log(`Ошибка: ${e}`)
    }
}


// Навигация
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageId = e.target.getAttribute('href').substring(1);
        showPage(pageId);
        
        document.querySelectorAll('.nav-link').forEach(navLink => {
            navLink.classList.remove('active');
        });
        e.target.classList.add('active');
    });
});


async function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(`${pageId}-page`).classList.add('active');

    // Инициализация страницы при переходе
    if (pageId === 'recommendations') {
        await loadRecommendations();
    }
}


// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    init();
    initWebSocketStatus();
    initRoulettePage();
    initChatsPage();
});


async function init() {
    const elUserName = document.getElementById('user-name');
    const elNickname = document.getElementById('nickname');
    const elAge = document.getElementById('age');
    const elGender = document.getElementById('gender');
    const elFirstName = document.getElementById('first_name');
    const elAboutMe = document.getElementById('about_me');

    try {
        currentUser = await apiFetch("/auth/me");
        currentUserId = currentUser.id;

        elUserName.textContent = currentUser.nickname || currentUser.id || "Игрок";
        elNickname.value = currentUser.nickname || "";
        elAge.value = currentUser.age || "";
        elGender.value = currentUser.gender || "other";
        elFirstName.value = currentUser.first_name || "";
        elAboutMe.value = currentUser.about_me || "";
    } catch (e) {
        console.error('Ошибка загрузки профиля:', e);
        elUserName.textContent = "Ошибка загрузки";
    }
    
    // Инициализация формы профиля
    document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        updateProfile();
    });
}


async function updateProfile() {
    const data = {};
    
    const age = document.getElementById('age').value;
    const gender = document.getElementById('gender').value;
    const firstName = document.getElementById('first_name').value;
    const aboutMe = document.getElementById('about_me').value;
    
    if (age) data.age = age;
    if (gender) data.gender = gender;
    if (firstName) data.first_name = firstName;
    if (aboutMe) data.about_me = aboutMe;
    
    try {
        await apiFetch("/user/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        
        // Обновляем данные пользователя
        const updatedUser = await apiFetch("/auth/me");
        document.getElementById('user-name').textContent = updatedUser.nickname || "Игрок";
        
    } catch (e) {
        console.error('Ошибка обновления профиля:', e);
    }
}


// WebSocket для статуса
const wsStatus = new ReconnectableWebSocket()

async function initWebSocketStatus() {
    try {
        const elOnlineStatus = document.getElementById('status');
        if (!elOnlineStatus) return;
        
        wsConnection = new WebSocket(`${BASE_URL_WS}/ws/status`);
        
        if (window.wsConnection) {
            window.wsConnection.close();
        }

        wsConnection.onopen = function() {
            console.log('WebSocket соединение установлено');
            elOnlineStatus.textContent = "● Онлайн";
            elOnlineStatus.style.color = "#4CAF50";
            
            wsStatus.reconnectAttempts = 0;
            wsStatus.reconnectDelay = 1000;
        };
    
        wsConnection.onclose = function() {
            console.log('WebSocket соединение закрыто');
            elOnlineStatus.textContent = "● Оффлайн";
            elOnlineStatus.style.color = "#d12020";
            
            if (event.code === 1000 && event.wasClean) {
                console.log('Соединение закрыто корректно');
                return;
            }
            
            if (wsStatus.reconnectAttempts >= wsStatus.maxReconnectAttempts) {
                console.error(`❌ Достигнут лимит попыток переподключения (${wsStatus.maxReconnectAttempts})`);
                elOnlineStatus.textContent = "● Ошибка";
                elOnlineStatus.style.color = "#ff9800";
                return;
            }
            
            wsStatus.reconnectAttempts++;
            let delay = Math.min(wsStatus.reconnectDelay * Math.pow(1.5, wsStatus.reconnectAttempts - 1), wsStatus.maxDelay);
            delay = delay * (0.8 + Math.random() * 0.4);
            
            console.log(`🔄 Попытка ${wsStatus.reconnectAttempts}/${wsStatus.maxReconnectAttempts} через ${Math.round(delay/1000)}с`);
            setTimeout(() => {
                console.log('🔄 Переподключаемся...');
                initWebSocketStatus();
            }, delay);
        };
        
        wsConnection.onerror = function(error) {
            console.error('wsConnection.onerror ошибка:', error);
        };

    } catch (e) {
        if (wsStatus.reconnectAttempts < wsStatus.maxReconnectAttempts) {
            wsStatus.reconnectAttempts++;
            let delay = Math.min(wsStatus.reconnectDelay * Math.pow(1.5, wsStatus.reconnectAttempts - 1), wsStatus.maxDelay);
            
            setTimeout(() => {
                initWebSocketStatus();
            }, delay);
        }
    }
}




/*
------------------------------------
             РУЛЕТКА
------------------------------------
*/


// Инициализация страницы рулетки
async function initRoulettePage() {
    // Проверяем, есть ли сохраненное состояние временного чата
    if (currentRoomId && currentPartnerId) {
        // Восстанавливаем состояние временного чата
        document.getElementById('search-interface').classList.add('hidden');
        document.getElementById('temp-chat-container').classList.remove('hidden');
        document.getElementById('partner-nickname').textContent = currentPartner?.nickname || 'Собеседник';
        
        // Восстанавливаем WebSocket соединение если оно было разорвано
        if (!tempChatWS || tempChatWS.readyState !== WebSocket.OPEN) await startTempChat();
    } else {
        document.getElementById('search-interface').classList.remove('hidden');
        document.getElementById('temp-chat-container').classList.add('hidden');
    }
    
    const startBtn = document.getElementById('start-roulette');
    const stopBtn = document.getElementById('stop-roulette');
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    // Обработчики для рулетки
    startBtn.addEventListener('click', startRouletteSearch);
    stopBtn.addEventListener('click', stopRouletteSearch);
}

// Запуск поиска в рулетке
async function startRouletteSearch() {
    const minAgeElement = document.getElementById('roulette-min-age');
    const maxAgeElement = document.getElementById('roulette-max-age');
    
    if (!minAgeElement || !maxAgeElement) {
        console.error('Элементы фильтров рулетки не найдены');
        return;
    }
    
    const minAge = parseInt(minAgeElement.value) || 18;
    const maxAge = parseInt(maxAgeElement.value) || 100;
    const gender = document.getElementById('roulette-gender').value;
    
    const filters = {
        gender: gender,
        min_age: minAge,
        max_age: maxAge
    };
    
    const startBtn = document.getElementById('start-roulette');
    const stopBtn = document.getElementById('stop-roulette');
    const status = document.getElementById('roulette-status');
    const animation = document.getElementById('roulette-animation');
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    status.textContent = 'Поиск союзника...';
    if (animation) animation.style.display = 'block';

    rouletteWS = new WebSocket(`${BASE_URL_WS}/ws/roulette`);
    
    rouletteWS.onmessage = function(event) {
        const data = JSON.parse(event.data);
        console.log('Roulette message:', data);

        if (data.type === 'match_found') {
            rouletteWS.close();
            rouletteWS = null;
            onMatchFound(data);
        }
    };

    rouletteWS.onopen = function() {
        rouletteWS.send(JSON.stringify({
            type: 'start_search',
            filters: filters
        }));
        status.textContent = 'Поиск...';
    };
    
    rouletteWS.onerror = function(error) {
        console.error('Roulette WebSocket error:', error);
        status.textContent = 'Ошибка подключения';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (animation) animation.style.display = 'none';
    };
    
    rouletteWS.onclose = function() {
        console.log('Roulette WebSocket закрыт');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        status.textContent = 'Поиск остановлен';
        if (animation) animation.style.display = 'none';
    };
}

// Остановка поиска в рулетке
async function stopRouletteSearch() {
    if (rouletteWS) {
        rouletteWS.send(JSON.stringify({ type: 'stop_search' }));
        rouletteWS.close();
        rouletteWS = null;
    }
    
    document.getElementById('start-roulette').disabled = false;
    document.getElementById('stop-roulette').disabled = true;
    document.getElementById('roulette-status').textContent = 'Поиск остановлен';
    const animation = document.getElementById('roulette-animation');
    if (animation) animation.style.display = 'none';
}

// Обработка найденного матча
async function onMatchFound(data) {
    try {
        currentRoomId = data.room_id;
        currentPartnerId = data.partner_id;
        
        // Загружаем информацию о партнере
        currentPartner = await apiFetch(`/user/${currentPartnerId}`);
        
        // Переключаем интерфейсы
        document.getElementById('search-interface').classList.add('hidden');
        document.getElementById('temp-chat-container').classList.remove('hidden');
        document.getElementById('roulette-status').textContent = 'Собеседник найден!';
        document.getElementById('partner-nickname').textContent = currentPartner.nickname || 'Аноним';
        
        // Инициализация временного чата
        await startTempChat();
        
    } catch (error) {
        console.error('Ошибка при обработке матча:', error);
        alert('Произошла ошибка при подключении к чату');
    }
}

// Запуск временного чата
async function startTempChat() {
    if (tempChatWS) tempChatWS.close();
    
    tempChatWS = new WebSocket(`${BASE_URL_WS}/ws/chat/${currentRoomId}`);
    
    tempChatWS.onopen = () => {
        console.log('Temp chat WebSocket connected');
        addSystemMessage('Чат подключен. Начните общение!');
        bindTempChatHandlers();
    };
    
    tempChatWS.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Temp chat message:', data);
        
        switch (data.type) {
            case 'chat_message':
                if (data.sender_id && data.sender_id === currentUserId) {
                    return;
                }
                addChatMessageToTemp(
                    data.content || data.message,
                    data.sender_id,
                    data.sender_name || 'Собеседник',
                    data.timestamp,
                    false
                );
                break;
                
            case 'user_disconnected':
                handleUserDisconnected(data);
                break;
                
            case 'like_user':
                handleLikeUser(data);
                break;
        }
    };
    
    tempChatWS.onclose = () => {
        console.log('Temp chat WebSocket disconnected');
    };
    
    tempChatWS.onerror = (error) => {
        console.error('Temp chat WebSocket error:', error);
    };
}

// Привязка обработчиков временного чата
async function bindTempChatHandlers() {
    // Отправка сообщений
    const tempSendBtn = document.getElementById('temp-send-btn');
    const tempMessageInput = document.getElementById('temp-message-input');
    
    if (tempSendBtn) tempSendBtn.addEventListener('click', sendTempMessage);
    
    if (tempMessageInput) {
        tempMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendTempMessage();
            }
        });
    }
    
    const likeChatBtn = document.getElementById('like-chat-btn');
    if (likeChatBtn) {
        likeChatBtn.classList.remove('hidden')
        likeChatBtn.addEventListener('click', likeUserTemp);
    }

    const passChatBtn = document.getElementById('pass-chat-btn');
    if (passChatBtn) {
        passChatBtn.classList.remove('hidden')
        passChatBtn.addEventListener('click', passUserTemp);
    }
    
    // Закрытие чата
    const endChatBtn = document.getElementById('end-chat-btn');
    if (endChatBtn) {
        endChatBtn.addEventListener('click', endTempChat);
    }
}

// Добавление системного сообщения
async function addSystemMessage(text) {
    const messagesContainer = document.getElementById('temp-chat-messages');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = text;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


// Добавление сообщения во временный чат
function addChatMessageToTemp(content, senderId, senderName, timestamp, isOwn) {
    const messagesContainer = document.getElementById('temp-chat-messages');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = isOwn ? 'message own' : 'message other';
    chatTextAlign = isOwn ? 'right' : 'left'
    messageElement.style.textAlign = chatTextAlign;

    const time = new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageElement.innerHTML = `
        <div class="message-sender">${senderName}</div>
        <div class="message-text">${escapeHtml(content)}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Отправка сообщения во временном чате
async function sendTempMessage() {
    const input = document.getElementById('temp-message-input');
    if (!input || input.disabled) return;
    
    const message = input.value.trim();
    if (!message || !tempChatWS || tempChatWS.readyState !== WebSocket.OPEN) return;
    
    // Отправляем сообщение
    tempChatWS.send(JSON.stringify({
        type: 'chat_message',
        message: message
    }));
    
    // Добавляем свое сообщение в чат
    addChatMessageToTemp(
        message,
        currentUserId,
        'Вы',
        new Date().toISOString(),
        true
    );
    
    input.value = '';
    input.focus();
}

// Обработка отключения пользователя
function handleUserDisconnected(data) {
    addSystemMessage('⚠️ Собеседник покинул чат');
}

// Запрос на постоянный чат
async function handleLikeUser(data) {
    if (!tempChatWS || tempChatWS.readyState !== WebSocket.OPEN) return;
    
    if (data && data.is_match === true) {
        await addSystemMessage('✅ У вас взаимная симпатия');
        await loadChatList();
    } else {
        await addSystemMessage('✅ Вы понравились собеседнику');
    }
}


// Функции для взаимодействия с пользователями
async function likeUserTemp() {
    try {
        const user = await apiFetch(`/user/${currentPartnerId}`);
        console.log(`Лайк отправлен пользователю ${currentPartnerId}`);
        
        const like = await apiFetch(`/match/like?to_user_id=${currentPartnerId}`, {
            method: "POST",
        });
        
        const likeChatBtn = document.getElementById('like-chat-btn');
        if (likeChatBtn) likeChatBtn.classList.add('hidden');

        if (like.is_match) {
            await loadChatList();
            tempChatWS.send(JSON.stringify({
                type: 'like_user',
                room_id: currentRoomId,
                is_match: true
            }));
            return;
        }

        tempChatWS.send(JSON.stringify({
            type: 'like_user',
            room_id: currentRoomId,
            is_match: false
        }));
    } catch (error) {
        console.error('Ошибка отправки лайка:', error);
    }
}

async function passUserTemp() {
    await endTempChat();
    console.log(`Пас пользователю ${currentPartnerId}`);
    await startRouletteSearch();
}

// Закрытие временного чата
async function endTempChat() {
    if (tempChatWS) {
        tempChatWS.close();
        tempChatWS = null;
    }
    
    // Показываем интерфейс поиска
    document.getElementById('search-interface').classList.remove('hidden');
    document.getElementById('temp-chat-container').classList.add('hidden');
    
    // Сбрасываем состояние
    currentRoomId = null;
    currentPartnerId = null;
    currentPartner = null;
    
    // Очищаем чат
    const tempChatMessages = document.getElementById('temp-chat-messages');
    if (tempChatMessages) {
        tempChatMessages.innerHTML = 
            '<div class="system-message">💬 Вы подключились к временному чату. Общайтесь здесь. Если понравится общение, можно сделать чат постоянным.</div>';
    }
    
    const likeChatBtn = document.getElementById('like-chat-btn');
    if (likeChatBtn) likeChatBtn.classList.remove('hidden');

    // Блокируем поле ввода и кнопку отправки
    const tempMessageInput = document.getElementById('temp-message-input');
    const tempSendBtn = document.getElementById('temp-send-btn');
    if (tempMessageInput) tempMessageInput.disabled = false;
    if (tempSendBtn) tempSendBtn.disabled = false;
    
    // Останавливаем поиск если он был активен
    if (rouletteWS) await stopRouletteSearch();
}




/*
------------------------------------
         ЛЕНТА РЕКОМЕНДАЦИЙ
------------------------------------
*/


// Лента рекомендаций
async function applyFilters() {
    await loadRecommendations();
}

async function loadMoreUsers() {
    await loadRecommendations();
}

async function loadRecommendations() {
    const minAgeElement = document.getElementById('search-min-age');
    const maxAgeElement = document.getElementById('search-max-age');
    const genderElement = document.getElementById('search-gender');
    
    if (!minAgeElement || !maxAgeElement || !genderElement) {
        console.error('Элементы фильтров не найдены');
        return;
    }
    
    const minAge = parseInt(minAgeElement.value) || 18;
    const maxAge = parseInt(maxAgeElement.value) || 100;
    const gender = genderElement.value;
    
    const filters = {
        gender: gender,
        min_age: minAge,
        max_age: maxAge
    };

    const container = document.getElementById('recommendations-container');
    if (!container) return;
    
    container.innerHTML = '';

    try {
        const recommendations = await apiFetch("/match/recommendations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(filters)
        });

        recommendations.forEach(user => {
            const userFirstName = user.first_name ? user.first_name : "Имя скрыто";
            const userAboutMe = user.about_me ? user.about_me : "Описание нет";

            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `
                <div class="user-info">
                    <div>
                        <span style="font-size: 24px; color:${user.is_online ? '#4CAF50' : '#d12020'}">${user.is_online ? '● Онлайн' : '● Оффлайн'}</span>
                        <div class="user-nickname dota-font">${user.nickname}, ${user.age}</div>
                        <div class="user-first_name">${userFirstName}</div>
                        <div class="user-about_me">${userAboutMe}</div>
                    </div>
                    <div class="user-actions">
                        <button class="btn" onclick="likeUser('${user.id}')">❤️ Лайк</button>
                        <button class="btn btn-outline" onclick="passUser('${user.id}')">👎 Пас</button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Ошибка загрузки рекомендаций:', error);
        container.innerHTML = '<p style="text-align: center; color: var(--dota-text-secondary);">Ошибка загрузки рекомендаций</p>';
    }
}

// Функции для взаимодействия с пользователями
async function likeUser(userId) {
    try {
        const user = await apiFetch(`/user/${userId}`);
        console.log(`Лайк отправлен пользователю ${userId}`);
        
        const like = await apiFetch(`/match/like?to_user_id=${userId}`, {
            method: "POST",
        });
        
        if (like.is_match) {
            alert(`🎉 МЭТЧ! Вы понравились ${user.nickname}! Начните общение в чате.`);
            await loadChatList();
        }
        passUser(userId);

    } catch (error) {
        console.error('Ошибка отправки лайка:', error);
    }
}

function passUser(userId) {
    console.log(`Пас пользователю ${userId}`);
    // Удаляем карточку из DOM
    document.querySelectorAll('.user-card').forEach(card => {
        if (card.querySelector(`button[onclick="likeUser('${userId}')"]`)) {
            card.style.transform = 'translateX(-100%)';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
        }
    });
}




/*
------------------------------------
               ЧАТЫ
------------------------------------
*/


// Инициализация страницы чатов
async function initChatsPage() {
    // Загружаем список чатов
    await loadChatList();
    
    // Привязываем обработчики
    await bindChatPageHandlers();
}

async function bindChatPageHandlers() {
    const sendBtn = document.getElementById('send-message');
    const messageInput = document.getElementById('message-input');
    
    if (sendBtn && messageInput) {
        sendBtn.addEventListener('click', sendChatMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
}


// Обновление списка чатов в UI
async function updateChatList(chats) {
    const chatListElement = document.getElementById('chat-list');
    if (!chatListElement) return;
    
    chatListElement.innerHTML = '';
    
    if (!chats || chats.length === 0) {
        chatListElement.innerHTML = '<li class="empty-chat">Нет активных чатов</li>';
        return;
    }
    
    for (const chat of chats) {
        const chatItem = document.createElement('li');
        chatItem.className = 'chat-item';
        chatItem.dataset.roomId = chat.room_id;
        
        // Определяем класс активности
        if (chat.unread_count > 0) {
            chatItem.classList.add('has-unread');
        }
        
        // <div class="chat-partner-avatar">${getAvatarForNickname(chat.partner_nickname)}</div>
        chatItem.innerHTML = `
            <div class="chat-partner">
                <button class="btn btn-sm btn-delete" onclick="deleteChat(event, '${chat.room_id}')">❌</button>
                <div>
                    <div class="dota-font">${chat.partner_nickname}</div>
                    <div style="font-size: 12px; color: var(--dota-text-secondary);">
                        ${chat.last_message ? chat.last_message.content.substring(0, 50) + '...' : 'Нет сообщений'}
                    </div>
                    ${chat.unread_count > 0 ? `<span class="unread-badge">${chat.unread_count}</span>` : ''}
                </div>
            </div>
        `;
        
        chatItem.addEventListener('click', (e) => {
            // Проверяем, не было ли клика по кнопке удаления
            if (!e.target.closest('.btn-delete')) {
                openChat(chat.room_id, chat.partner_nickname);
            }
        });
        chatListElement.appendChild(chatItem);
    }
}

// Удаление чата
async function deleteChat(event, roomId) {
    event.stopPropagation(); // Останавливаем всплытие, чтобы не открывался чат
    
    if (!confirm('Вы уверены, что хотите удалить этот чат? Все сообщения будут удалены.')) return;
    
    try {
        // Отправляем запрос на удаление
        const chatWS = activeChatWebSockets[roomId];
        const res = await apiFetch(`/chats/${roomId}`, {
            method: 'DELETE',
        });
        
        if (!res.ok) return;

        if (activeChatWebSockets[roomId]) {
            activeChatWebSockets[roomId].close();
            delete activeChatWebSockets[roomId];
        }

        if (chatWS && chatWS.readyState === WebSocket.OPEN) {
            chatWS.send(JSON.stringify({
                type: 'delete_chat',
                room_id: currentRoomId,
            }));
        }

        await deleteChatDOM(roomId);
        
    } catch (error) {
        console.error('Ошибка при удалении чата:', error);
        showNotification('Не удалось удалить чат', 'error');
    }
}


// Удаление чата DOM
async function deleteChatDOM(roomId, isRemoteNotification = false) {
    const chatItem = document.querySelector(`.chat-item[data-room-id="${roomId}"]`);
    if (chatItem) {
        // Анимация удаления
        chatItem.style.opacity = '0';
        chatItem.style.transform = 'translateX(-100%)';
        
        setTimeout(() => {
            chatItem.remove();
            
            // Если это удаленный чат (получено уведомление), показываем другое сообщение
            if (isRemoteNotification) {
                showNotification('Чат был удален собеседником', 'info');
            }

            // Проверяем, был ли это открытый чат
            const currentRoomId = document.getElementById('chat-room')?.dataset.roomId;
            if (currentRoomId === roomId) closeChat();
            
            // Если чатов не осталось, показываем сообщение
            const remainingChats = document.querySelectorAll('.chat-item').length;
            if (remainingChats === 0) {
                const chatListElement = document.getElementById('chat-list');
                chatListElement.innerHTML = '<li class="empty-chat">Нет активных чатов</li>';
            }
 
            // Показываем уведомление
            showNotification('Чат успешно удален', 'success');
        }, 300);
    } else if (isRemoteNotification) {
        // Если элемента нет в DOM, но пришло уведомление
        showNotification('Чат был удален собеседником', 'info');
    }
}

// Вспомогательная функция для показа уведомлений
function showNotification(message, type = 'info') {
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        border-radius: 4px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Удаляем уведомление через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Функция для закрытия открытого чата
async function closeChat() {
    const chatRoom = document.getElementById('chat-messages');
    if (chatRoom) {
        chatRoom.innerHTML = `
        <div class="empty-chat-message">
            <p>Выберите чат из списка слева, чтобы начать общение</p>
            <p style="font-size: 12px; color: var(--dota-text-secondary); margin-top: 10px;">
                Или найдите нового собеседника в разделе "Рулетка"
            </p>
        </div>`;
    }
}


// Открытие чата
async function openChat(roomId, partnerNickname) {
    // Закрываем предыдущий активный чат
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Активируем выбранный чат
    const chatItem = document.querySelector(`.chat-item[data-room-id="${roomId}"]`);
    if (chatItem) {
        chatItem.classList.add('active');
    }
    
    // Обновляем заголовок чата
    const partnerNameElement = document.getElementById('chat-partner-name');
    if (partnerNameElement) {
        partnerNameElement.textContent = partnerNickname;
    }
    
    // Включаем поле ввода и кнопку отправки
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message');
    if (messageInput && sendBtn) {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
    
    // Загружаем сообщения
    await loadChatMessages(roomId);
    
    // Подключаемся к WebSocket чата
    await connectToChatWebSocket(roomId);
    
    // Очищаем badge непрочитанных
    if (chatItem) {
        const badge = chatItem.querySelector('.unread-badge');
        if (badge) badge.remove();
    }
}

// Загрузка сообщений чата
async function loadChatMessages(roomId) {
    try {
        const response = await apiFetch(`/chats/${roomId}/messages?limit=100`);
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '';
        
        if (!response || response.length === 0) {
            messagesContainer.innerHTML = '<div class="empty-chat-message">Нет сообщений. Начните общение!</div>';
            return;
        }
        
        for (const msg of response) {
            addMessageToChat(
                msg.content,
                msg.sender_id,
                !msg.is_own ? (msg.sender_nickname || "Собеседник") : 'Вы',
                msg.timestamp,
                msg.is_own
            );
        }
    } catch (error) {
        console.error('Error loading chat messages:', error);
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="error-message">Ошибка загрузки сообщений</div>';
        }
    }
}

// Подключение к WebSocket конкретного чата
async function connectToChatWebSocket(roomId) {
    // Закрываем предыдущее соединение с этой комнатой
    if (activeChatWebSockets[roomId]) activeChatWebSockets[roomId].close();
    
    const chatWS = new WebSocket(`${BASE_URL_WS}/ws/chat/${roomId}`);
    
    chatWS.onopen = () => {
        console.log(`Chat ${roomId} WebSocket connected`);
    };
    
    chatWS.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'chat_message':
                addMessageToChat(
                    data.content,
                    data.sender_id,
                    !data.is_own ? (data.sender_nickname || "Собеседник") : 'Вы',
                    data.timestamp,
                    data.is_own
                );
                break;
                
            case 'user_disconnected':
                handleUserDisconnected(data);
                break;
                
            case 'delete_chat':
                deleteChatDOM(data.room_id, true);
                break;
        } 
    };
    
    chatWS.onclose = () => {
        console.log(`Chat ${roomId} WebSocket disconnected`);
        delete activeChatWebSockets[roomId];
    };
    
    chatWS.onerror = (error) => {
        console.error(`Chat ${roomId} WebSocket error:`, error);
    };
    
    activeChatWebSockets[roomId] = chatWS;
}

// Отправка сообщения в постоянный чат
async function sendChatMessage() {
    const input = document.getElementById('message-input');
    if (!input || input.disabled) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    // Получаем активный чат
    const activeChat = document.querySelector('.chat-item.active');
    if (!activeChat) return;
    
    const roomId = activeChat.dataset.roomId;
    const chatWS = activeChatWebSockets[roomId];
    
    if (chatWS && chatWS.readyState === WebSocket.OPEN) {
        chatWS.send(JSON.stringify({
            type: 'chat_message',
            message: message
        }));
        
        input.value = '';
        input.focus();
    }
}

// Добавление сообщения в постоянный чат
function addMessageToChat(content, senderId, senderName, timestamp, isOwn) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    // Убираем сообщение о пустом чате
    const emptyMessage = messagesContainer.querySelector('.empty-chat-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = isOwn ? 'message own' : 'message other';
    
    const time = new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageElement.innerHTML = `
        <div class="message-sender">${senderName}</div>
        <div class="message-text">${escapeHtml(content)}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Загрузка списка чатов
async function loadChatList() {
    try {
        const chats = await apiFetch('/chats/');
        await updateChatList(chats);
    } catch (error) {
        console.error('Error loading chat list:', error);
    }
}

// Вспомогательные функции
function getAvatarForNickname(nickname) {
    const avatars = ['👤', '👨', '👩', '🧙', '⚔️', '🛡️', '🎮'];
    const hash = nickname.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return avatars[hash % avatars.length];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
