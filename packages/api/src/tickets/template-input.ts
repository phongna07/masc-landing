import { z } from "zod";

// Shared by previews, downloaded artwork, and delivery emails. Always Vietnamese.
export const ticketTemplateCopy = Object.freeze({
	"subject": "Xác nhận mua vé tham dự chung kết Marketing All-Star Challenge",
	"giftSubject": "Bạn nhận được vé mời tham dự chung kết Marketing All-Star Challenge",
	"intro": "Ban tổ chức đã xác nhận thanh toán của bạn. Mỗi vé trong đơn được gửi kèm dưới dạng ảnh PNG có mã QR để vào cửa.",
	"giftIntro": "Ban tổ chức gửi tặng bạn một vé tham dự sự kiện của Marketing All-Star Challenge. Bạn chỉ cần xuất trình mã QR trên vé khi đến, không cần đăng nhập tài khoản.",
	"attachments": "Vui lòng tải và lưu các ảnh vé đính kèm để xuất trình khi đến sự kiện. Nếu không mở được ảnh, vui lòng liên hệ ban tổ chức để được hỗ trợ.",
	"revokedNotice": "Vé đã bị thu hồi và không còn giá trị sử dụng để vào cửa.",
	"normal": "Vé thường",
	"vip": "Vé VIP",
	"validity": "Tình trạng vé",
	"valid": "Hợp lệ",
	"revoked": "Đã thu hồi",
	"admissionQr": "Mã QR vào cửa (không dùng để thanh toán)",
	"networkingLunch": "Bao gồm Networking Lunch",
	"confidential": "Mã vé và mã QR có thể được dùng để vào cửa. Vui lòng không đăng công khai và chỉ gửi cho người sẽ sử dụng vé.",
	"code": "Mã vé",
	"package": "Gói vé",
	"total": "Tổng tiền đơn hàng",
	"order": "Đơn hàng",
	"quantity": "Số lượng vé"
});

export const ticketTemplatePalette = Object.freeze({
	background: "#07070a", surface: "#111014", border: "#38343d", text: "#f4f0e8", muted: "#c2bec6",
	accent: "#d2a66c", highlight: "#f2d584", highlightBackground: "#201c16",
	normal: "#d8d0ff", vip: "#f2d584", valid: "#bde7ad", revoked: "#ff6b62",
});

export const ticketTemplateAppearance = Object.freeze({
	artwork: Object.freeze({ brand: "Chung kết Marketing All-Star Challenge 2026", titleSize: 36, bodySize: 22 }),
	email: Object.freeze({ brand: "Chung kết Marketing All-Star Challenge 2026", headingFont: "Georgia, serif", titleSize: 30, bodySize: 14, width: 650 }),
});

// Preview callers can choose sample scenarios, never text or appearance overrides.
export const previewTicketTemplatesInput = z.strictObject({
	category: z.enum(["normal", "vip"]),
	validity: z.enum(["valid", "revoked"]),
	source: z.enum(["purchased", "gifted"]),
	quantity: z.number().int().min(1).max(3),
});
