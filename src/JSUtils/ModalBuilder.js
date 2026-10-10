define(function() {
    const Item = Object.freeze({
        modal: "modal",
        modalContent: "content",
        buttonsContainer: "buttons"
    });

    class ModalBuilder {
        constructor(document) {
            this.document = document;
            this.modal = this.document.createElement('div');
            this.modalContent = this.document.createElement('div');
            this.buttonsContainer = this.document.createElement('div');
        }

        addStyle(item, style) {
            switch (item) {
            case Item.modal:
                Object.assign(this.modal.style, style);
                break;
            case Item.modalContent:
                Object.assign(this.modalContent.style, style);
                break;
            case Item.buttonsContainer:
                Object.assign(this.buttonsContainer.style, style);
                break;

            default:
                break;
            }
            return this;
        }

        addTitle(title, color) {
            this.title = this.document.createElement('h2');
            this.title.textContent = title;
            this.title.style.color = color;
            return this;
        }

        addMessage(message) {
            this.modalMessage = document.createElement('p');
            message.split('\n').forEach((part, index, array) => {
                this.modalMessage.appendChild(document.createTextNode(part));
                if (index < array.length - 1) { // Don't add a break on the last element
                    this.modalMessage.appendChild(document.createElement('br'));
                }
            });
            return this;
        }

        addButton(title) {
            const button = this.document.createElement('button');
            button.textContent = title;
            this.buttonsContainer.appendChild(button);
            return button;
        }

        addButton(title, style) {
            const button = this.addButton(title);
            Object.assign(button.style, style);
            return button;
        }

        addButton(title, style, onclick) {
            const button = this.addButton(title, style);
            button.onclick = onclick;
            return button;
        }

        build() {
            this.modalContent.appendChild(this.title);
            this.modalContent.appendChild(this.message);
            this.modalContent.appendChild(this.buttonsContainer);
            this.modal.appendChild(this.modalContent);
            return this.modal;
        }
    }

    return ModalBuilder;
});
