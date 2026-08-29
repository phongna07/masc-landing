export const automatedEmailNotice = "Email này được gửi tự động nên không thể tiếp nhận phản hồi. Đội thi cần hỗ trợ vui lòng liên hệ qua Email: masc26.work@gmail.com";

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
        .greeting { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
        .footer { margin-top: 30px; font-size: 14px; border-top: 1px solid #eeeeee; padding-top: 15px; }
        .automated-notice { margin: 18px 0 0; color: #777777; font-size: 11px; line-height: 1.5; }
        .automated-notice a { color: #5d3593; }
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
            <div class="footer">Trân trọng,<br><strong>Ban Tổ chức Marketing All-Star Challenge 2026</strong></div>
            <p class="automated-notice">Email này được gửi tự động nên không thể tiếp nhận phản hồi. Đội thi cần hỗ trợ vui lòng liên hệ qua Email: <a href="mailto:masc26.work@gmail.com">masc26.work@gmail.com</a></p>
        </div>
    </div>
</body>
</html>`;

    const text = `${contentText}

Trân trọng,
Ban Tổ chức Marketing All-Star Challenge 2026

${automatedEmailNotice}`;

    return { html, text };
}
