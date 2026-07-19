export const teamRegistrationRejectedEvent = "team_registration_rejected";
export const teamRegistrationRejectedSubject = "Thông báo kết quả đăng ký Marketing All-Star Challenge";

function escapeHtml(value: string) {
	return value.replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#039;",
	})[character] ?? character);
}

export function renderTeamRegistrationRejected(teamName: string) {
	const safeTeamName = escapeHtml(teamName);
	const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${teamRegistrationRejectedSubject}</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f9f9f9; margin: 0; padding: 20px; color: #333333; }
        .email-container { max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 2px solid #5d3593; border-radius: 4px; overflow: hidden; }
        .banner { width: 100%; display: block; }
        .content { padding: 30px 25px; line-height: 1.6; }
        .greeting { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
        .info-block { background-color: #f3effa; border-left: 4px solid #5d3593; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
        .info-title { font-weight: bold; color: #5d3593; margin-bottom: 10px; font-size: 15px; }
        .footer { margin-top: 30px; font-size: 14px; border-top: 1px solid #eeeeee; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="email-container">
        <img src="https://marketingallstarchallenge.com/banner.jpg" alt="Marketing All-Star Challenge Banner" class="banner">
        <div class="content">
            <div class="greeting">Thân gửi đại diện đội thi,</div>
            <p>Ban Tổ chức Marketing All-Star Challenge chân thành cảm ơn đội bạn đã quan tâm và đăng ký tham gia cuộc thi.</p>
            <div class="info-block">
                <div class="info-title">KẾT QUẢ ĐĂNG KÝ</div>
                <strong>Tên đội:</strong> ${safeTeamName}<br>
                <p>Sau quá trình xem xét, Ban Tổ chức rất tiếc phải thông báo rằng hồ sơ đăng ký của đội chưa được chấp thuận tham gia cuộc thi.</p>
            </div>
            <p>Ban Tổ chức trân trọng sự quan tâm và thời gian đội đã dành cho Marketing All-Star Challenge.</p>
            <div class="footer">Trân trọng,<br><strong>Ban Tổ chức Marketing All-Star Challenge</strong></div>
        </div>
    </div>
</body>
</html>`;

	const text = `Thân gửi đại diện đội thi,

Ban Tổ chức Marketing All-Star Challenge chân thành cảm ơn đội bạn đã quan tâm và đăng ký tham gia cuộc thi.

KẾT QUẢ ĐĂNG KÝ
Tên đội: ${teamName}

Sau quá trình xem xét, Ban Tổ chức rất tiếc phải thông báo rằng hồ sơ đăng ký của đội chưa được chấp thuận tham gia cuộc thi.

Ban Tổ chức trân trọng sự quan tâm và thời gian đội đã dành cho Marketing All-Star Challenge.

Trân trọng,
Ban Tổ chức Marketing All-Star Challenge`;

	return { html, text };
}
