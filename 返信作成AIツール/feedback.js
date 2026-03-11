document.addEventListener('DOMContentLoaded', () => {
    const feedbackBtn = document.getElementById('feedbackBtn');
    const feedbackModal = document.getElementById('feedbackModal');
    const closeFeedbackBtn = document.getElementById('closeFeedbackBtn');
    const sendFeedbackBtn = document.getElementById('sendFeedbackBtn');
    const feedbackNameInput = document.getElementById('feedbackName');
    const feedbackMessageInput = document.getElementById('feedbackMessage');

    // Utility Toast wrapper
    function showFeedbackToast(message) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast hidden';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', () => {
            feedbackModal.classList.remove('hidden');
        });
    }

    if (closeFeedbackBtn) {
        closeFeedbackBtn.addEventListener('click', () => {
            feedbackModal.classList.add('hidden');
        });
    }

    if (sendFeedbackBtn) {
        sendFeedbackBtn.addEventListener('click', async () => {
            const name = feedbackNameInput.value.trim();
            const message = feedbackMessageInput.value.trim();

            if (!message) {
                alert('ご意見・ご感想を入力してください。');
                feedbackMessageInput.focus();
                return;
            }

            const originalText = sendFeedbackBtn.innerHTML;
            sendFeedbackBtn.disabled = true;
            sendFeedbackBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 送信中...';

            try {
                const response = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, message })
                });

                if (response.ok) {
                    showFeedbackToast('フィードバックを送信しました。ご協力ありがとうございます！');
                    feedbackMessageInput.value = '';
                    feedbackModal.classList.add('hidden');
                } else {
                    throw new Error('サーバーエラー');
                }
            } catch (error) {
                console.error('Feedback send error:', error);
                alert('フィードバックの送信に失敗しました。サーバーが最新の状態か確認してください。');
            } finally {
                sendFeedbackBtn.disabled = false;
                sendFeedbackBtn.innerHTML = originalText;
            }
        });
    }
});
