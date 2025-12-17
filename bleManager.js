// bleManager.js - Управление BLE подключением к кубику
// Отвечает за подключение к устройству, чтение и запись данных через Web Bluetooth API

class BleManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        this.isConnected = false;
        
        // UUID устройства, сервиса и характеристики
        this.CUBE_UUID = '85301596-98b5-b0bb-e882-fd4f797fbdb2';
        this.SERVICE_UUID = '4FAFC201-1FB5-459E-8FCC-C5C9C331914B';
        this.CHARACTERISTIC_UUID = 'BEB5483E-36E1-4688-B7F5-EA07361B26A8';
        
        // Версия приложения
        this.APP_VERSION = '0.1.1';

        // Коллбэки для событий
        this.onDataReceived = null;
        this.onConnectionChange = null;
        this.onError = null;
        
        this.log('BLE Manager инициализирован');

        // Добавляем бейдж версии в заголовок
        this.addVersionBadge();
    }
    
    // Логирование с меткой времени
    log(message, data = null) {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[${timestamp}] 🔵 BLE: ${message}`);
        if (data) console.log(data);
    }
    
    // Проверка поддержки Web Bluetooth API
    checkBluetoothSupport() {
        // Проверяем наличие API
        if (!navigator.bluetooth) {
            const error = 'Web Bluetooth API не поддерживается в этом браузере';
            this.log(error);
            if (this.onError) this.onError(error);
            return false;
        }

        // Дополнительная проверка для iOS
        const userAgent = navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;

        if (isIOS) {
            // Проверяем версию Safari (Web Bluetooth доступен с iOS 15.4)
            const versionMatch = userAgent.match(/OS (\d+)_(\d+)/);
            if (versionMatch) {
                const majorVersion = parseInt(versionMatch[1], 10);
                const minorVersion = parseInt(versionMatch[2], 10);

                if (majorVersion < 15 || (majorVersion === 15 && minorVersion < 4)) {
                    const error = 'Web Bluetooth требует iOS 15.4 или выше';
                    this.log(error);
                    if (this.onError) this.onError(error);
                    return false;
                }
            }

            // Проверяем, что мы на HTTPS или localhost
            const isLocalhost = window.location.hostname === 'localhost' ||
                               window.location.hostname === '127.0.0.1';
            const isSecure = window.location.protocol === 'https:';

            if (!isLocalhost && !isSecure) {
                const error = 'Web Bluetooth на iOS требует HTTPS (кроме localhost)';
                this.log(error);
                if (this.onError) this.onError(error);
                return false;
            }
        }

        return true;
    }
    
    // Подключение к BLE устройству
    async connect() {
        if (!this.checkBluetoothSupport()) {
            throw new Error('Web Bluetooth API не поддерживается');
        }
        
        try {
            this.log('Запрос устройства...');
            
            // Запрашиваем устройство с фильтром по UUID сервиса
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [this.SERVICE_UUID] }]
            });
            
            this.log(`Устройство найдено: ${this.device.name || 'Без имени'}`);
            
            // Подключаемся к GATT серверу
            this.server = await this.device.gatt.connect();
            this.log('Подключено к GATT серверу');
            
            // Получаем сервис
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            this.log('Сервис получен');
            
            // Получаем характеристику
            this.characteristic = await this.service.getCharacteristic(this.CHARACTERISTIC_UUID);
            this.log('Характеристика получена');
            
            // Устанавливаем флаг подключения
            this.isConnected = true;
            
            // Добавляем обработчик отключения
            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnect();
            });
            
            this.log('Подключение успешно установлено');
            if (this.onConnectionChange) this.onConnectionChange(true);
            
            return this.device;
            
        } catch (error) {
            this.log('Ошибка подключения', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }
    
    // Отключение от устройства
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            try {
                this.device.gatt.disconnect();
                this.log('Отключение инициировано');
            } catch (error) {
                this.log('Ошибка при отключении', error);
            }
        }
        this.handleDisconnect();
    }
    
    // Обработка отключения (вызывается также при событии gattserverdisconnected)
    handleDisconnect() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        
        this.log('Устройство отключено');
        if (this.onConnectionChange) this.onConnectionChange(false);
    }
    
    // Чтение данных с характеристики
    async readData() {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('Нет активного BLE подключения');
        }
        
        try {
            this.log('Чтение данных...');
            
            const value = await this.characteristic.readValue();
            const bytes = Array.from(new Uint8Array(value.buffer));
            const text = new TextDecoder().decode(value);
            
            this.log(`Прочитано ${bytes.length} байт`, { bytes, text: text.substring(0, 100) + '...' });
            
            // Вызываем коллбэк с сырыми данными
            if (this.onDataReceived) {
                this.onDataReceived({ bytes, text, timestamp: Date.now() });
            }
            
            return { bytes, text };
            
        } catch (error) {
            this.log('Ошибка чтения данных', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }
    
    // Запись данных в характеристику
    async writeData(data) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('Нет активного BLE подключения');
        }
        
        try {
            this.log('Запись данных...', { data });
            
            let buffer;
            if (data instanceof Uint8Array) {
                buffer = data;
            } else if (Array.isArray(data)) {
                buffer = new Uint8Array(data);
            } else if (typeof data === 'number') {
                buffer = new Uint8Array([data]);
            } else {
                throw new Error('Неподдерживаемый формат данных для записи');
            }
            
            await this.characteristic.writeValue(buffer);
            this.log(`Записано ${buffer.length} байт`);
            
            return true;
            
        } catch (error) {
            this.log('Ошибка записи данных', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }
    
    // Команда сброса счетчиков на кубике (отправляет байт 1)
    async resetCounters() {
        try {
            console.clear(); // Очистка консоли при сбросе
            await this.writeData(new Uint8Array([1]));
            this.log('Консоль очищена. Команда сброса отправлена');
            return true;
        } catch (error) {
            this.log('Ошибка отправки команды сброса', error);
            throw error;
        }
    }
    
    // Подписка на уведомления (если поддерживается)
    async startNotifications() {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('Нет активного BLE подключения');
        }
        
        try {
            await this.characteristic.startNotifications();
            
            this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
                const value = event.target.value;
                const bytes = Array.from(new Uint8Array(value.buffer));
                const text = new TextDecoder().decode(value);
                
                this.log('Получены уведомления', { bytes, text: text.substring(0, 100) + '...' });
                
                if (this.onDataReceived) {
                    this.onDataReceived({ bytes, text, timestamp: Date.now(), type: 'notification' });
                }
            });
            
            this.log('Уведомления активированы');
            return true;
            
        } catch (error) {
            this.log('Ошибка активации уведомлений', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }
    
    // Остановка уведомлений
    async stopNotifications() {
        if (!this.isConnected || !this.characteristic) {
            return;
        }
        
        try {
            await this.characteristic.stopNotifications();
            this.log('Уведомления остановлены');
        } catch (error) {
            this.log('Ошибка остановки уведомлений', error);
        }
    }
    
    // Добавление бейджа версии в заголовок приложения
    addVersionBadge() {
        // Ждем загрузки DOM
        if (typeof document !== 'undefined' && document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.insertVersion());
        } else {
            setTimeout(() => this.insertVersion(), 100);
        }
    }

    // Вставка элемента версии
    insertVersion() {
        try {
            // Ищем заголовок h1 в приложении
            const headers = document.querySelectorAll('h1');
            let targetHeader = null;

            // Предпочитаем заголовок внутри .header или просто первый h1
            for (const header of headers) {
                if (header.closest('.header') || header.textContent.includes('Кубик')) {
                    targetHeader = header;
                    break;
                }
            }

            if (!targetHeader && headers.length > 0) {
                targetHeader = headers[0];
            }

            if (targetHeader) {
                // Проверяем, не добавлен ли уже бейдж
                if (targetHeader.querySelector('.version-badge')) {
                    return;
                }

                // Создаем элемент версии
                const versionBadge = document.createElement('span');
                versionBadge.className = 'version-badge';
                versionBadge.textContent = `v${this.APP_VERSION}`;
                versionBadge.title = `Версия приложения: ${this.APP_VERSION}`;

                // Вставляем после текста заголовка
                targetHeader.appendChild(versionBadge);

                this.log(`Бейдж версии ${this.APP_VERSION} добавлен в заголовок`);
            } else {
                this.log('Заголовок для бейджа версии не найден');
            }
        } catch (error) {
            this.log('Ошибка при добавлении бейджа версии', error);
        }
    }

    // Получение состояния подключения
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            deviceName: this.device ? this.device.name : null,
            deviceId: this.device ? this.device.id : null,
            serviceUuid: this.SERVICE_UUID,
            characteristicUuid: this.CHARACTERISTIC_UUID,
            appVersion: this.APP_VERSION
        };
    }
}

// Экспорт для использования в Node.js или браузере
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BleManager;
} else if (typeof window !== 'undefined') {
    window.BleManager = BleManager;
}