import { renderEmailLayout } from "./email-layout";

export const teamRoundPromotionEvent = "team_round_promotion";

function escapeHtml(value: string) {
	return value.replace(/[&<>"']/g, (character) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
	})[character] ?? character);
}

export function renderTeamRoundPromotion(teamName: string, sourceRound: string, targetRound: string) {
	const subject = `Thông báo đội thi được tham gia Vòng ${targetRound} — Marketing All-Star Challenge`;
	return {
		subject,
		...renderEmailLayout({
			subject,
			contentHtml: `<div class="greeting">Thân gửi đại diện đội thi,</div>
				<p>Ban Tổ chức xin chúc mừng đội <strong>${escapeHtml(teamName)}</strong> đã vượt qua Vòng ${escapeHtml(sourceRound)} và được tham gia Vòng ${escapeHtml(targetRound)}.</p>
				<p>Thông tin và khu vực nộp bài của vòng mới đã được mở trên dashboard của đội.</p>`,
			contentText: `Thân gửi đại diện đội thi,\n\nBan Tổ chức xin chúc mừng đội ${teamName} đã vượt qua Vòng ${sourceRound} và được tham gia Vòng ${targetRound}.\n\nThông tin và khu vực nộp bài của vòng mới đã được mở trên dashboard của đội.`,
		}),
	};
}
