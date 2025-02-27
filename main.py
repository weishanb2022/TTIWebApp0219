from flask import Flask, render_template, request, jsonify, Response
import os

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = '/mnt/azurefile/web-app-storage/uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

UPLOAD_PATH = "/mnt/azurefile/web-app-storage/uploads"

# 根路径，返回首页
@app.route('/')
def index():
    return render_template('index.html')  # 确保 index.html 存在

# 获取文件夹列表
@app.route('/folders', methods=['GET'])
def get_folders():
    try:
        folders = [folder for folder in os.listdir(UPLOAD_PATH) if os.path.isdir(os.path.join(UPLOAD_PATH, folder))]
        return jsonify(folders)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

# 获取指定文件夹中的文件
@app.route('/files', methods=['GET'])
def get_files():
    folder_name = request.args.get('folder')  # 获取文件夹名
    folder_path = os.path.join(UPLOAD_PATH, folder_name)

    if os.path.exists(folder_path) and os.path.isdir(folder_path):
        files = {'geojson': [], 'csv': []}

        # 获取文件夹内的所有子文件夹（如日期文件夹）
        for date_folder in os.listdir(folder_path):
            date_folder_path = os.path.join(folder_path, date_folder)
            if os.path.isdir(date_folder_path):  # 确保是日期文件夹
                # 遍历日期文件夹，查找其中的 geojson 和 csv 文件
                for file_name in os.listdir(date_folder_path):
                    if file_name.endswith('.geojson'):
                        files['geojson'].append(file_name)
                    elif file_name.endswith('.csv'):
                        files['csv'].append(file_name)

        # 返回文件夹中找到的文件列表
        return jsonify(files)

    return jsonify({"status": "error", "message": "Folder not found"}), 400

# 新增流式读取轨迹数据的接口
@app.route('/get_track_data', methods=['GET'])
def get_track_data():
    folder = request.args.get('folder')  # 获取文件夹名
    date = request.args.get('date')      # 获取日期
    track_id = request.args.get('track_id')  # 获取轨迹 ID（这里的 track_id 现在没有使用，但你可以将其添加到文件内容中）

    # 动态构建文件路径，假设每个日期文件夹下的 CSV 文件以日期命名
    file_path = os.path.join(UPLOAD_PATH, folder, date, f"{date}.csv")

    print(f"Requesting file from path: {file_path}")  # Debug：检查构建的文件路径

    if not os.path.exists(file_path):
        return jsonify({"status": "error", "message": f"CSV file {date}.csv not found in {folder}/{date}"}), 404

    def generate():
        try:
            with open(file_path, 'r') as f:
                buffer = []
                for line in f:
                    if line.startswith(track_id):  # 按 track_id 过滤数据
                        buffer.append(line)
                        # 每 10 行发送一次
                        if len(buffer) >= 10:
                            yield ''.join(buffer)
                            buffer = []
                # 发送剩余内容
                if buffer:
                    yield ''.join(buffer)
        except Exception as e:
            yield f"Error while streaming: {str(e)}"

    return Response(generate(), content_type='text/plain')

# 上传和保存文件
@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files.get('file')
    if file:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(file_path)
        return jsonify({"status": "success", "file": file_path})
    return jsonify({"status": "error", "message": "Invalid file format"}), 400
