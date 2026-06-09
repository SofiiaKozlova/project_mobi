document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector(".feedback-form");

    if (!form) return;

    form.addEventListener("submit", function (e) {
        const flashMessage = document.querySelector(".flash-message");
        if (flashMessage) {
            flashMessage.remove();
        }

        let valid = true;

        const name = document.getElementById("name");
        const rating = document.getElementById("rating");
        const feedback = document.getElementById("feedback");

        document.querySelectorAll(".error-message").forEach(el => {
            el.textContent = "";
        });

        document.querySelectorAll(".input-error").forEach(el => {
            el.classList.remove("input-error");
        });

        if (!name.value.trim()) {
            document.getElementById("name-error").textContent = "Please enter your name.";
            name.classList.add("input-error");
            valid = false;
        }

        if (!rating.value) {
            document.getElementById("rating-error").textContent = "Please select a rating.";
            rating.classList.add("input-error");
            valid = false;
        }

        if (!feedback.value.trim()) {
            document.getElementById("feedback-error").textContent = "Please enter your feedback.";
            feedback.classList.add("input-error");
            valid = false;
        }

        if (!valid) {
            e.preventDefault();
        }
    });
});