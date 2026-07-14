export const teamRegistrationSuccessEvent = "team_registration_success";
export const teamRegistrationSuccessSubject = "Xác nhận đăng ký Marketing All-Star Challenge";

type TeamMember = {
  fullName: string;
  email: string;
  universityName: string;
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

export function renderTeamRegistrationSuccess(teamName: string, members: TeamMember[]) {
  const rows = members.map((member) => `
                        <tr>
                            <td>${escapeHtml(member.fullName)}</td>
                            <td>${escapeHtml(member.email)}</td>
                            <td>${escapeHtml(member.universityName)}</td>
                        </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${teamRegistrationSuccessSubject}</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f9f9f9; margin: 0; padding: 20px; color: #333333; }
        .email-container { max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 2px solid #5d3593; border-radius: 4px; overflow: hidden; }
        .banner { width: 100%; display: block; }
        .content { padding: 30px 25px; line-height: 1.6; }
        .greeting { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
        .info-block { background-color: #f3effa; border-left: 4px solid #5d3593; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
        .info-title { font-weight: bold; color: #5d3593; margin-bottom: 10px; font-size: 15px; }
        .member-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .member-table th, .member-table td { text-align: left; padding: 8px; border-bottom: 1px solid #e0e0e0; font-size: 14px; }
        .member-table th { color: #555555; font-weight: bold; }
        .note-list { padding-left: 20px; margin-top: 10px; }
        .note-list li { margin-bottom: 8px; }
        .footer { margin-top: 30px; font-size: 14px; border-top: 1px solid #eeeeee; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="email-container">
        <img src="https://marketingallstarchallenge.com/banner.jpg" alt="Marketing All-Star Challenge Banner" class="banner">
        <div class="content">
            <div class="greeting">Thân gửi đại diện đội thi,</div>
            <p>Ban Tổ chức Marketing All-Star Challenge xin xác nhận thông tin đăng ký tham gia cuộc thi của đội bạn đã được hệ thống ghi nhận thành công.</p>
            <p>Để đảm bảo mọi thông tin hiển thị trên hệ thống và giấy chứng nhận sau này chính xác, vui lòng kiểm tra kỹ các thông tin chi tiết dưới đây:</p>
            <div class="info-block">
                <div class="info-title">THÔNG TIN ĐỘI THI ĐÃ ĐĂNG KÝ</div>
                <strong>Tên đội:</strong> ${escapeHtml(teamName)}<br>
                <table class="member-table">
                    <thead><tr><th>Họ và tên</th><th>Email</th><th>Trường đại học</th></tr></thead>
                    <tbody>${rows}
                    </tbody>
                </table>
            </div>
            <p><strong>Lưu ý quan trọng từ Ban Tổ chức:</strong></p>
            <ul class="note-list">
                <li>Nếu phát hiện bất kỳ sai sót nào về thông tin thành viên, đại diện đội thi vui lòng phản hồi lại email này trong vòng <strong>24 giờ</strong> kể từ khi nhận được thông báo.</li>
                <li>Các thông tin cập nhật về đề bài, mốc thời gian và quy chế vòng sơ loại sẽ được gửi trực tiếp đến email của từng thành viên. Bạn vui lòng nhắc nhở các bạn trong đội kiểm tra cả hòm thư Spam/Quảng cáo để không bỏ lỡ.</li>
            </ul>
            <div class="footer">Trân trọng,<br><strong>Ban Tổ chức Marketing All-Star Challenge</strong></div>
        </div>
    </div>
</body>
</html>`;

  const roster = members.map((member) =>
    `- ${member.fullName} | ${member.email} | ${member.universityName}`,
  ).join("\n");
  const text = `Thân gửi đại diện đội thi,

Ban Tổ chức Marketing All-Star Challenge xin xác nhận thông tin đăng ký tham gia cuộc thi của đội bạn đã được hệ thống ghi nhận thành công.

Để đảm bảo mọi thông tin hiển thị trên hệ thống và giấy chứng nhận sau này chính xác, vui lòng kiểm tra kỹ các thông tin chi tiết dưới đây:

THÔNG TIN ĐỘI THI ĐÃ ĐĂNG KÝ
Tên đội: ${teamName}
${roster}

Lưu ý quan trọng từ Ban Tổ chức:
- Nếu phát hiện bất kỳ sai sót nào về thông tin thành viên, đại diện đội thi vui lòng phản hồi lại email này trong vòng 24 giờ kể từ khi nhận được thông báo.
- Các thông tin cập nhật về đề bài, mốc thời gian và quy chế vòng sơ loại sẽ được gửi trực tiếp đến email của từng thành viên. Bạn vui lòng nhắc nhở các bạn trong đội kiểm tra cả hòm thư Spam/Quảng cáo để không bỏ lỡ.

Trân trọng,
Ban Tổ chức Marketing All-Star Challenge`;

  return { html, text };
}
