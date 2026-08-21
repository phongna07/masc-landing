import type { RoundId } from "../rounds";
import { renderEmailLayout } from "./email-layout";

export const teamEliminatedEvent = "team_eliminated";

const roundLabels: Record<RoundId, string> = {
	"0.5": "Vòng Sơ loại",
	"1": "Vòng 1",
	"2": "Vòng 2",
	"3": "Vòng Thực Chiến",
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

export function renderTeamEliminated(teamName: string, round: RoundId) {
	const roundLabel = roundLabels[round];
	const safeTeamName = escapeHtml(teamName);
	const safeRoundLabel = escapeHtml(roundLabel);
	const subject = `Thông báo kết quả ${roundLabel} — Marketing All-Star Challenge 2026`;
	const contentHtml = `
            <div class="greeting">Thân gửi đại diện đội thi,</div>
            <p>Ban Tổ chức Marketing All-Star Challenge 2026 chân thành cảm ơn đội bạn đã tham gia và nỗ lực trong ${safeRoundLabel}.</p>
            <div class="info-block">
                <div class="info-title">KẾT QUẢ VÒNG THI</div>
                <strong>Tên đội:</strong> ${safeTeamName}<br>
                <strong>Vòng thi:</strong> ${safeRoundLabel}<br>
                <p>Sau quá trình đánh giá, Ban Tổ chức rất tiếc phải thông báo rằng đội chưa đủ điều kiện để tiếp tục hành trình tại cuộc thi.</p>
            </div>
            <p>Ban Tổ chức trân trọng những nỗ lực và tâm huyết đội đã dành cho Marketing All-Star Challenge 2026.</p>`;
	const contentText = `Thân gửi đại diện đội thi,

Ban Tổ chức Marketing All-Star Challenge 2026 chân thành cảm ơn đội bạn đã tham gia và nỗ lực trong ${roundLabel}.

KẾT QUẢ VÒNG THI
Tên đội: ${teamName}
Vòng thi: ${roundLabel}

Sau quá trình đánh giá, Ban Tổ chức rất tiếc phải thông báo rằng đội chưa đủ điều kiện để tiếp tục hành trình tại cuộc thi.

Ban Tổ chức trân trọng những nỗ lực và tâm huyết đội đã dành cho Marketing All-Star Challenge 2026.`;

	return {
		subject,
		...renderEmailLayout({
			subject,
			contentHtml,
			contentText,
			styles: `
        .info-block { background-color: #f3effa; border-left: 4px solid #5d3593; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
        .info-title { font-weight: bold; color: #5d3593; margin-bottom: 10px; font-size: 15px; }`,
		}),
	};
}
