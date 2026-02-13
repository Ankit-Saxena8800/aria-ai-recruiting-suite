/**
 * Toast Notification Component
 * Simple, elegant toast notifications for user feedback
 */

class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.createContainer());
        } else {
            this.createContainer();
        }
    }

    createContainer() {
        // Create container if it doesn't exist
        if (!document.querySelector('.toast-container')) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            if (document.body) {
                document.body.appendChild(this.container);
            }
        } else {
            this.container = document.querySelector('.toast-container');
        }
    }

    /**
     * Show a toast notification
     * @param {string} type - success, error, warning, info
     * @param {string} title - Toast title
     * @param {string} message - Toast message
     * @param {number} duration - Duration in ms (default: 5000)
     */
    show(type, title, message, duration = 5000) {
        // Ensure container exists
        if (!this.container) {
            this.createContainer();
        }

        const toast = this.createToast(type, title, message, duration);

        if (this.container) {
            this.container.appendChild(toast);
            this.toasts.push(toast);

            // Auto remove after duration
            setTimeout(() => {
                this.remove(toast);
            }, duration);
        }

        return toast;
    }

    createToast(type, title, message, duration) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || 'ℹ'}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close" onclick="window.toast.remove(this.parentElement)">×</button>
            <div class="toast-progress"></div>
        `;

        return toast;
    }

    remove(toast) {
        if (!toast) return;

        toast.classList.add('closing');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
            this.toasts = this.toasts.filter(t => t !== toast);
        }, 300);
    }

    // Convenience methods
    success(title, message, duration) {
        return this.show('success', title, message, duration);
    }

    error(title, message, duration) {
        return this.show('error', title, message, duration);
    }

    warning(title, message, duration) {
        return this.show('warning', title, message, duration);
    }

    info(title, message, duration) {
        return this.show('info', title, message, duration);
    }

    // Clear all toasts
    clearAll() {
        this.toasts.forEach(toast => this.remove(toast));
    }
}

// Create global instance
window.toast = new ToastManager();

// Expose convenience functions globally
window.showToast = (type, title, message, duration) => window.toast.show(type, title, message, duration);
window.toastSuccess = (title, message, duration) => window.toast.success(title, message, duration);
window.toastError = (title, message, duration) => window.toast.error(title, message, duration);
window.toastWarning = (title, message, duration) => window.toast.warning(title, message, duration);
window.toastInfo = (title, message, duration) => window.toast.info(title, message, duration);
