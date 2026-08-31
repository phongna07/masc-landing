type EmailLayoutOptions = {
    subject: string;
    contentHtml: string;
    contentText: string;
    styles?: string;
};

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;",
    })[character] ?? character);
}

export function renderEmailLayout({
    subject,
    contentHtml,
    contentText,
    styles = "",
}: EmailLayoutOptions) {
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f9f9f9; margin: 0; padding: 20px; color: #333333; }
        .email-container { max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 2px solid #5d3593; border-radius: 4px; overflow: hidden; }
        .banner { width: 100%; display: block; }
        .content { padding: 30px 25px; line-height: 1.6; }
        .content p { margin: 0 0 16px; }
        .content p:last-of-type { margin-bottom: 0; }
        .content ul, .content ol { margin: 0 0 16px; padding-left: 26px; }
        .content ul { list-style-type: disc; }
        .content ol { list-style-type: decimal; }
        .content ul ul { list-style-type: circle; }
        .content ol ol { list-style-type: lower-alpha; }
        .content li { margin: 0 0 6px; padding-left: 2px; }
        .content li:last-child { margin-bottom: 0; }
        .content li > ul, .content li > ol { margin-top: 6px; margin-bottom: 0; }
        .content a { color: #5d3593; text-decoration: underline; }
        .greeting { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
        ${styles}
        @media screen and (max-width: 600px) {
            body { padding: 0; }
            .email-container { border-left: 0; border-right: 0; border-radius: 0; }
            .content { padding: 22px 16px; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <img src="https://marketingallstarchallenge.com/banner.jpg" alt="Marketing All-Star Challenge Banner" class="banner">
        <div class="content">
${contentHtml}
        </div>
    </div>
</body>
</html>`;

    return { html, text: contentText };
}
