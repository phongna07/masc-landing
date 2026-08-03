import { renderEmailLayout } from "./email-layout";

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
	const contentHtml = `
            <div class="greeting">Thân gửi đại diện đội thi,</div>
            <p>Ban Tổ chức Marketing All-Star Challenge 2026 chân thành cảm ơn đội bạn đã quan tâm và đăng ký tham gia cuộc thi.</p>
            <div class="info-block">
                <div class="info-title">KẾT QUẢ ĐĂNG KÝ</div>
                <strong>Tên đội:</strong> ${safeTeamName}<br>
                <p>Sau quá trình xem xét, Ban Tổ chức rất tiếc phải thông báo rằng hồ sơ đăng ký của đội chưa được chấp thuận tham gia cuộc thi.</p>
            </div>
            <p>Ban Tổ chức trân trọng sự quan tâm và thời gian đội đã dành cho Marketing All-Star Challenge.</p>`;

	const contentText = `Thân gửi đại diện đội thi,

Ban Tổ chức Marketing All-Star Challenge 2026 chân thành cảm ơn đội bạn đã quan tâm và đăng ký tham gia cuộc thi.

KẾT QUẢ ĐĂNG KÝ
Tên đội: ${teamName}

Sau quá trình xem xét, Ban Tổ chức rất tiếc phải thông báo rằng hồ sơ đăng ký của đội chưa được chấp thuận tham gia cuộc thi.

Ban Tổ chức trân trọng sự quan tâm và thời gian đội đã dành cho Marketing All-Star Challenge.`;

	return renderEmailLayout({
		subject: teamRegistrationRejectedSubject,
		contentHtml,
		contentText,
		styles: `
        .info-block { background-color: #f3effa; border-left: 4px solid #5d3593; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
        .info-title { font-weight: bold; color: #5d3593; margin-bottom: 10px; font-size: 15px; }`,
	});
}
