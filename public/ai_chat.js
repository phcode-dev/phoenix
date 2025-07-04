document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');

    // Function to add a message to the chat interface
    function addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
        messageDiv.textContent = text;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to the bottom
    }

    // Function to handle sending a message
    async function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText === '') {
            return;
        }

        addMessage(messageText, 'user');
        messageInput.value = ''; // Clear input field
        typingIndicator.style.display = 'block'; // Show typing indicator

        try {
            // Assuming Laravel is served at the root and api.php routes are prefixed with /api
            // If your Laravel setup is different (e.g., in a subfolder or different port), adjust the URL.
            const response = await fetch('/api/vanilla-ai-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') // Optional: for CSRF if web routes are used
                },
                body: JSON.stringify({ message: messageText })
            });

            typingIndicator.style.display = 'none'; // Hide typing indicator

            if (!response.ok) {
                const errorData = await response.json();
                addMessage(`Error: ${errorData.message || response.statusText}`, 'ai');
                if (errorData.reply) { // Show detailed reply from backend if available
                    addMessage(errorData.reply, 'ai');
                }
                return;
            }

            const data = await response.json();
            if (data.reply) {
                addMessage(data.reply, 'ai');
            } else {
                addMessage('Sorry, I could not get a reply.', 'ai');
            }

        } catch (error) {
            typingIndicator.style.display = 'none'; // Hide typing indicator
            console.error('Send message error:', error);
            addMessage(`Network error or server is unreachable. (${error.message})`, 'ai');
        }
    }

    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    // Initial focus on input
    messageInput.focus();
});
