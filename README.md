# Spell Quest

Website học từ vựng tiếng Anh theo từng bài trong sách. Mỗi bài là **một file JSON**. Trang chủ, trò chơi và **Bản đồ từ vựng 3D** đều tự sinh từ các file đó.

## Thêm bài học mới

1. Sao chép `data/lessons/_template.json` thành `data/lessons/06-ten-bai.json`. Số đầu tên file phải trùng với `id`.
2. Điền nội dung bài. Phần nào chưa có thì để `[]`.
3. Đưa lên GitHub:

```bash
git add data
git commit -m "Thêm bài 6"
git push
```

Khoảng một phút sau website có bài mới, và các từ của bài đã nằm trên bản đồ 3D. Nếu file có lỗi, GitHub Actions báo đúng file và vị trí lỗi, còn website giữ nguyên bản đang chạy.

Sửa bài cũ cũng vậy: sửa file JSON rồi push.

## Cấu trúc file bài học

| Trường | Bắt buộc | Nội dung |
|---|---|---|
| `id` | có | Số bài |
| `title` | có | Tên bài |
| `words` | có | Phần 1: Viết từ, đồng thời là dữ liệu của bản đồ 3D |
| `quiz` | | Phần 2: Trắc nghiệm lỗi thường gặp |
| `exercises` | | Phần 3: Bài tập trong sách |
| `lint` | | Quy tắc dò lỗi cho phần 3 |
| `topics` | | Chủ đề **mới** trên bản đồ 3D |
| `links` | | Cặp từ liên quan trên bản đồ 3D, ví dụ `["bride", "groom"]` |

Mỗi từ trong `words`:

```json
{
  "w": "honeymoon",
  "ipa": "ˈhʌnimuːn",
  "t": "danh từ",
  "vi": "tuần trăng mật",
  "topic": "marriage",
  "q": "Ngay sau đám cưới, hai vợ chồng xách va li đi Đà Lạt vài ngày. Chuyến đi ấy chính là điều này.",
  "ex": "They went on their ___ to Italy."
}
```

- `w`, `vi`, `t`, `topic` là bắt buộc, và cần có `q` (câu gợi ý) hoặc `img` (ảnh).
- `topic` dùng mã có sẵn trong `data/topics.json`. Nếu cần chủ đề mới, khai báo trong `topics` của bài.
- Trong `quiz`, đáp án đúng luôn đặt **đầu tiên** trong `o`, trò chơi tự trộn.
- Mở file bằng VS Code sẽ có gợi ý và kiểm tra trường nhờ `data/lesson.schema.json`.

### Bài có ảnh

Đặt ảnh vào thư mục trùng tên file bài, ví dụ `data/images/06-ten-bai/coat.jpg`, rồi ghi `"img": "img/coat.jpg"` trong từ đó.

## Chạy thử trên máy

Cần Node.js 20 trở lên, không phải cài thêm thư viện.

```bash
npm run dev     # mở http://localhost:4173, tự build lại khi sửa file
npm run check   # chỉ kiểm tra dữ liệu
npm run build   # sinh website vào dist/
```

## Đưa lên GitHub lần đầu

1. Tạo repository trống trên GitHub.
2. Chạy:

```bash
git remote add origin <URL của repository>
git push -u origin main
```

3. Trên GitHub, vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
4. Vào tab **Actions**, chạy lại workflow **Build and deploy** nếu lần đầu bị lỗi do chưa bật Pages.

## Tiến độ học

Điểm, bài làm và danh sách từ hay sai được lưu trong trình duyệt của từng thiết bị, nên iPad và máy tính có tiến độ riêng.

## Thư mục

```text
data/lessons/    Mỗi bài một file JSON
data/images/     Ảnh của từng bài
data/topics.json Các chủ đề trên bản đồ 3D
src/             Giao diện trang chủ, trò chơi, bản đồ 3D
scripts/         Kiểm tra dữ liệu, build, chạy thử
.github/         Tự động deploy lên GitHub Pages
```
