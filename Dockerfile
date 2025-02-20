# 使用 Python 3.7 镜像
FROM python:3.7-slim

# 设置工作目录
WORKDIR /app

# 复制 requirements.txt 并安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目文件（包括 main.py、static、templates 等）
COPY . .

# 创建上传文件夹（如果不存在）
RUN mkdir -p /app/static/uploads

# 暴露端口（与 main.py 中的端口一致）
EXPOSE 7000

# 运行主程序
CMD ["python", "main.py"]