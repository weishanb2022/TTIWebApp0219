            const INITIAL_VIEW_STATE = {
                longitude: -98.4936,
                latitude: 29.4241,
                zoom: 10,
                pitch: 0,
                bearing: 0,
            };

            let deckMap;
            let layers = [];
            let popupElement;
            let miniMap;
			let totalPoints = 0;
			let heatMapLayers = []; // 存储热力图图层的数组

            function initializeMap() {
                deckMap = new deck.DeckGL({
                    container: 'map',
                    initialViewState: INITIAL_VIEW_STATE,
                    controller: true,
					onClick: handleClick,
                    layers: [
                        new deck.TileLayer({
                            id: 'tile-layer',
                            data: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            minZoom: 0,
                            maxZoom: 19,
                            tileSize: 256,
							renderSubLayers: (props) => {
								const {
									bbox: { west, south, east, north }
								} = props.tile;

								const {x, y, z} = props.tile;
								const id = `bitmap-layer-${z}-${x}-${y}`; // 使用瓦片的 x, y, z 值来构建唯一的 ID

								return new deck.BitmapLayer({
									id: id,
									data: null,
									image: props.data,
									bounds: [west, south, east, north], // 确保这里使用的变量已经定义
								});
							},
                        }),
                    ],
                });

                popupElement = document.createElement('div');
                popupElement.id = 'popup';
                popupElement.style.position = 'absolute';
                popupElement.style.background = 'white';
                popupElement.style.border = '1px solid #ccc';
                popupElement.style.padding = '10px';
                popupElement.style.borderRadius = '8px';
                popupElement.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                popupElement.style.display = 'none';
                popupElement.style.width = '600px';
                popupElement.style.height = '300px';
				popupElement.style.overflow = 'hidden'; // 防止内容溢出
				popupElement.style.display = 'flex'; // 弹窗内容左右排列
				// 创建弹窗的内容容器（HTML 结构）
				popupElement.innerHTML = `
					<div style="display: flex; width: 100%; height: 100%;">
						<!-- 属性信息 -->
						<div id="attribute-info" style="flex: 1; padding-right: 10px; overflow-y: auto;">
						</div>
						<!-- 小地图 -->
						<div id="minimap-container" style="flex: 1; height: 100%;"></div>
					</div>
				`;

                document.body.appendChild(popupElement);
				setupDocumentClickListener();
				setupPopupClickListener();
            }
			document.addEventListener('DOMContentLoaded', () => {
				const popup = document.getElementById('popup');
				if (popup) popup.style.display = 'none';
			});

                        // 文件夹选择功能
            function loadFolders() {
                fetch('/folders')
                    .then(response => response.json())
                    .then(folders => {
                        const folderPicker = document.getElementById('folder-picker');
                        folders.forEach(folder => {
                            const option = document.createElement('option');
                            option.value = folder;
                            option.textContent = folder;
                            folderPicker.appendChild(option);
                        });
                    })
                    .catch(error => console.error('Error loading folders:', error));
            }

            // 根据选择的文件夹加载文件
            function loadFilesFromFolder() {
                const folder = document.getElementById('folder-picker').value;
                const filePicker = document.getElementById('file-picker');
                filePicker.innerHTML = '<option value="">Select File</option>'; // 清空文件列表

                if (!folder) return;

                fetch(`/files?folder=${folder}`)
                    .then(response => response.json())
                    .then(data => {
                        const { geojson, csv } = data;
                        geojson.forEach(file => {
                            const option = document.createElement('option');
                            option.value = file;
                            option.textContent = file;
                            filePicker.appendChild(option);
                        });
                        csv.forEach(file => {
                            const option = document.createElement('option');
                            option.value = file;
                            option.textContent = file;
                            filePicker.appendChild(option);
                        });
                    })
                    .catch(error => console.error('Error loading files:', error));
            }

            // 调用函数初始化文件夹选择
            loadFolders();

            function validateData() {
                // 获取日期值和文件夹值
                const dateInput = document.getElementById('date-picker');
                const selectedDate = dateInput.value; // Flatpickr 已格式化为 "YYYY-MM-DD"
                const folder = document.getElementById('folder-picker').value; // 获取选择的文件夹

                if (!selectedDate) {
                    alert('Please select a date.');
                    return;
                }

                if (!folder) {
                    alert('Please select a folder.');
                    return;
                }

                // 构造文件路径
                const folderPath = `mnt/azurefile/web-app-storage/uploads/${folder}/${selectedDate}`;
                let missingFilesCount = 0;  // 用来计数缺失的文件数量
                const allowedMissingFiles = 23;  // 允许最多缺失的文件小时数

                console.log(`Checking files for folder: ${folder}, date: ${selectedDate}`);

                // 检查每个小时的文件
                const fileChecks = [];
                for (let i = 0; i < 24; i++) {
                    let hour = i.toString().padStart(2, '0');
                    let geoJsonPath = `${folderPath}/${hour}.geojson`;
                    let csvPath = `${folderPath}/${hour}.csv`;

                    // 检查每个小时的 GeoJSON 文件
                    const geoJsonCheck = fetch(geoJsonPath)
                        .then(response => {
                            if (!response.ok) {
                                missingFilesCount++; // 如果文件不存在或无法访问，计数增加
                                console.log(`GeoJSON file missing for hour ${hour}`);
                            }
                        })
                        .catch(error => {
                            missingFilesCount++;
                            console.log(`Error checking GeoJSON file for hour ${hour}: ${error.message}`);
                        });

                    // 检查每个小时的 CSV 文件
                    const csvCheck = fetch(csvPath)
                        .then(response => {
                            if (!response.ok) {
                                missingFilesCount++; // 如果文件不存在或无法访问，计数增加
                                console.log(`CSV file missing for hour ${hour}`);
                            }
                        })
                        .catch(error => {
                            missingFilesCount++;
                            console.log(`Error checking CSV file for hour ${hour}: ${error.message}`);
                        });

                    // 将两个文件检查加入 fileChecks
                    fileChecks.push(geoJsonCheck, csvCheck);
                }

                // 等待所有文件检查完成
                Promise.all(fileChecks)
                    .then(() => {
                        if (missingFilesCount > allowedMissingFiles) {
                            alert(`More than ${allowedMissingFiles} files are missing. Please check your data.`);
                        } else {
                            alert(`Data is complete for the selected date with ${missingFilesCount} missing files.`);
                        }
                    })
                    .catch(error => {
                        console.error("Error occurred during file validation:", error);
                        alert("An error occurred while checking the files.");
                    });
            }
            // 选择文件夹时，传递文件夹名
            const selectedFolder = document.getElementById('folder-picker').value;  // 获取选择的文件夹名
            function updateMapCenter(folder) {
                // 默认中心：圣安东尼奥
                let newCenter = { latitude: 29.4241, longitude: -98.4936 };
                let zoomLevel = 10;  // 默认缩放级别

                // 定义 Dallas 的中心点和缩放级别
                const dallasCenter = { latitude: 32.442073, longitude: -97.084431 };
                const dallasZoomLevel = 18;  // 例如，Dallas 缩放级别设为 12

                // 如果选择的文件夹是 Dallas，更新地图中心和缩放级别
                if (folder === 'Dallas') {
                    newCenter = dallasCenter;
                    zoomLevel = dallasZoomLevel;
                }

                // 更新地图的中心和缩放级别
                deckMap.setProps({
                    initialViewState: {
                        longitude: newCenter.longitude,
                        latitude: newCenter.latitude,
                        zoom: zoomLevel,
                        pitch: 0,
                        bearing: 0,
                    }
                });
            }

            // 文件夹选择时更新地图中心和缩放级别
            document.getElementById('folder-picker').addEventListener('change', function () {
                const selectedFolder = this.value;  // 获取用户选择的文件夹名
                updateMapCenter(selectedFolder);    // 更新地图中心和缩放级别
            });
			function toggleHourSelection() {
				let hourPicker = document.getElementById('hour-picker');
				let timeOfDayPicker = document.getElementById('time-of-day-picker');
				let timeOfDayCheckbox = document.getElementById('time-of-day-checkbox');

				if (document.getElementById('hour-checkbox').checked) {
					clearMapLayers(); // Clear all map layers
					hourPicker.style.display = 'block';
					populateHourPicker();
					timeOfDayPicker.style.display = 'none';
					timeOfDayCheckbox.checked = false; // Uncheck and disable time of day selection
				} else {
					hourPicker.style.display = 'none';
				}
			}

			function toggleTimeOfDaySelection() {
				let hourPicker = document.getElementById('hour-picker');
				let timeOfDayPicker = document.getElementById('time-of-day-picker');
				let hourCheckbox = document.getElementById('hour-checkbox');

				if (document.getElementById('time-of-day-checkbox').checked) {
					clearMapLayers(); // Clear all map layers
					timeOfDayPicker.style.display = 'block';
					hourPicker.style.display = 'none';
					hourCheckbox.checked = false; // Uncheck and disable hour selection
				} else {
					timeOfDayPicker.style.display = 'none';
				}
			}

            function populateHourPicker() {
                let hourPicker = document.getElementById('hour-picker');
                hourPicker.innerHTML = '';
                for (let i = 0; i < 24; i++) {
                    let hour = i.toString().padStart(2, '0');
                    let option = document.createElement('option');
                    option.value = hour;
                    option.textContent = `${hour}:00`;
                    hourPicker.appendChild(option);
                }
            }

			function addSelectedDataToLayer() {
				if (document.getElementById('hour-checkbox').checked) {
					loadGeoJsonForHour();
				} else if (document.getElementById('time-of-day-checkbox').checked) {
					loadTimeOfDayFiles();
				}
			}

			function loadGeoJsonForHour() {
				const selectedDate = document.getElementById('date-picker').value; // 格式是 YYYY-MM-DD
				const selectedHour = document.getElementById('hour-picker').value; // 小时 HH
                const folder = document.getElementById('folder-picker').value; // 获取选择的文件夹
                const folderPath = `mnt/azurefile/web-app-storage/uploads/${folder}/${selectedDate}`; // 包含文件夹和日期
                const geoJsonPath = `${folderPath}/${selectedHour}.geojson`;

				fetch(geoJsonPath)
					.then(response => response.json())
					.then(geojson => {
						const layerName = `${selectedDate}-${selectedHour}:00`;
						const layerId = `geojson-layer-${selectedDate}-${selectedHour}`;
						const randomColor = [Math.random() * 255, Math.random() * 255, Math.random() * 255, 200];
						addGeoJsonLayer(geojson, layerId, layerName, randomColor,selectedFolder);
					})
					.catch(error => {
						console.error('Error loading GeoJSON:', error);
						alert('Failed to load GeoJSON.');
					});
			}

            function loadTimeOfDayFiles() {
                const selectedDate = document.getElementById('date-picker').value;
                const timeOfDay = document.getElementById('time-of-day-picker').value;
                const folder = document.getElementById('folder-picker').value; // 获取选择的文件夹
                const timeRanges = {
                    morning: ["06", "07", "08", "09", "10", "11"],
                    afternoon: ["12", "13", "14", "15", "16", "17"],
                    evening: ["18", "19", "20", "21"],
                    night: ["22", "23", "00", "01", "02", "03", "04", "05"]
                };

                const folderPath = `mnt/azurefile/web-app-storage/uploads/${folder}/${selectedDate}`; // 包含文件夹和日期
                const times = timeRanges[timeOfDay];
                let promises = [];

                times.forEach(hour => {
                    const geoJsonPath = `${folderPath}/${hour}.geojson`; // 这里的路径需要包含文件夹和日期
                    const promise = fetch(geoJsonPath)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Failed to load data for ${hour}:00 on ${selectedDate}`);
                            }
                            return response.json();
                        })
                        .then(geojson => {
                            const layerName = `${selectedDate}-${hour}:00`;
                            const layerId = `geojson-layer-${selectedDate}-${hour}`;
                            const randomColor = getTimeOfDayColor(timeOfDay);
                            addGeoJsonLayer(geojson, layerId, layerName, randomColor,selectedFolder);
                        })
                        .catch(error => {
                            console.error('Error loading GeoJSON:', error);
                        });
                    promises.push(promise);
                });

                Promise.all(promises).then(() => {
                    console.log("All time of day files loaded.");
                }).catch(error => {
                    console.error("Some files failed to load:", error);
                });
            }

            function getTimeOfDayColor(timeOfDay) {
                const colors = {
                    morning: [253, 184, 99, 200],  // Orange
                    afternoon: [57, 106, 177, 200],  // Blue
                    evening: [218, 124, 48, 200],  // Dark Orange
                    night: [62, 150, 81, 200]  // Green
                };
                return colors[timeOfDay];
            }

            function addGeoJsonLayer(geojson, layerId, layerName, fillColor = null, timeOfDay = null, selectedFolder = null) {
                // Check if the layer is already added
                const isLayerExists = layers.some(layer => layer.id === layerId);
                if (isLayerExists) {
                    alert("This layer has already been added.");
                    return; // Exit the function if the layer already exists
                }

                // Get color for the layer
                const color = fillColor || getColorForLayer(timeOfDay);

                // Set point radius based on the selected folder
                let pointRadius = 10; // Default point radius

                if (selectedFolder === 'Dallas') {
                    pointRadius = 5;
                } else if (selectedFolder === 'SA') {
                    pointRadius = 20;
                }

                const geoJsonLayer = new deck.GeoJsonLayer({
                    id: layerId,
                    data: geojson,
                    pickable: true,
                    stroked: true,
                    filled: true,
                    extruded: false,
                    lineWidthScale: 0.001,
                    lineWidthMinPixels: 0.001,
                    getFillColor: color,
                    getLineColor: [255, 100, 100],
                    getPointRadius: pointRadius,  // Dynamically set the point radius
                    getLineWidth: 1,
                    onClick: handleClick,
                });

                // Save layer information including color
                layers.push({ id: layerId, name: layerName, layer: geoJsonLayer, visible: true, color });

                updateLayerList(); // Update layer list
                updateMapLayers(); // Update map
            }

            function updateLayerList() {
                const layerList = document.getElementById('layer-list');
                const layerSelector = document.getElementById('layer-selector');
                layerList.innerHTML = ''; // 清空现有列表
                layerSelector.innerHTML = '<option value="">Select Layer</option>'; // 清空图层选择器

                layers.forEach((layerInfo) => {
                    // 更新图层列表
                    const li = document.createElement('li');
                    li.style.display = 'flex';
                    li.style.alignItems = 'center';
                    li.style.marginBottom = '5px';

                    const colorPreview = document.createElement('div');
                    colorPreview.style.width = '15px';
                    colorPreview.style.height = '15px';
                    colorPreview.style.borderRadius = '50%';
                    colorPreview.style.marginRight = '10px';
                    colorPreview.style.backgroundColor = `rgba(${layerInfo.color.join(',')})`;

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = layerInfo.name;

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Delete';
                    deleteButton.style.marginLeft = '10px';
                    deleteButton.onclick = () => {
                        layers = layers.filter((l) => l.id !== layerInfo.id);
                        updateLayerList();
                        updateMapLayers();
                    };

                    li.appendChild(colorPreview);
                    li.appendChild(nameSpan);
                    li.appendChild(deleteButton);
                    layerList.appendChild(li);

                    // 更新图层选择器
                    const option = document.createElement('option');
                    option.value = layerInfo.id;
                    option.textContent = layerInfo.name;
                    layerSelector.appendChild(option);
                });
            }

			function updateMapLayers() {
				const tileLayer = new deck.TileLayer({
					id: 'tile-layer',
					data: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
					minZoom: 0,
					maxZoom: 19,
					tileSize: 256,
					renderSubLayers: (props) => {
						const {
							bbox: { west, south, east, north }
						} = props.tile;

						const { x, y, z } = props.tile;
						const id = `bitmap-layer-${z}-${x}-${y}`;

						return new deck.BitmapLayer({
							id: id,
							data: null,
							image: props.data,
							bounds: [west, south, east, north],
						});
					},
				});

				// Filter to only include visible layers
				const visibleLayers = layers.filter(layerInfo => layerInfo.visible).map(layerInfo => layerInfo.layer);
                const visibleHeatMapLayers = heatMapLayers.map(heatMapLayerInfo => heatMapLayerInfo.layer);
				// Set the new layer array on the map
				deckMap.setProps({
					layers: [tileLayer, ...visibleLayers, ...visibleHeatMapLayers],
				});
			}
			function handleClick(info) {
				if (info.object && info.layer) {
					const { x, y } = info; // 屏幕坐标
					const { geometry, properties } = info.object;
					const [longitude, latitude] = geometry.coordinates;

					// 获取图层 ID
					const layerId = info.layer.id;

					// 查找图层的名称
					const layerInfo = layers.find(layer => layer.id === layerId);
					const layerName = layerInfo ? layerInfo.name : 'Unknown Layer';

					// 从属性中获取 category1 和 category2
					const { category1, category2 } = properties;
					const date = layerName.split('-').slice(0, 3).join('-');

					// 加载并显示轨迹
					loadAndDisplayTracks(date, category1, category2, latitude, longitude);

					// 设置弹窗位置并显示
					popupElement.style.left = `${x}px`;
					popupElement.style.top = `${y}px`;
					popupElement.style.display = 'block';

					// 更新弹窗内容，包括图层名称
					const attributeInfo = document.getElementById('attribute-info');
					attributeInfo.innerHTML = `
						<p><strong>Layer Name:</strong> ${layerName}</p>
						${generateAttributeHTML(properties)}
					`;

					// 初始化或更新小地图
					if (!miniMap) {
						initializeMiniMap(popupElement.querySelector('#minimap-container'), longitude, latitude);
					} else {
						miniMap.setView([latitude, longitude], 16);
					}

					// 在小地图上添加点击点的标记
					if (miniMap) {
						// 清除之前的标记
						miniMap.eachLayer(layer => {
							if (layer instanceof L.Marker) miniMap.removeLayer(layer);
						});
						// 添加新的标记
						L.marker([latitude, longitude]).addTo(miniMap);
					}
				}
			}

			// 生成属性内容的 HTML
			function generateAttributeHTML(properties) {
				if (!properties) return '<p>No additional information available.</p>';
				return Object.keys(properties)
					.map((key) => `<p><strong>${key}:</strong> ${properties[key]}</p>`)
					.join('');
			}

			// 点击文档时关闭弹窗
			function setupDocumentClickListener() {
				document.addEventListener('click', (event) => {
					// 检查点击目标是否在弹窗或弹窗内的内容上
					if (!popupElement.contains(event.target)) {
						popupElement.style.display = 'none'; // 隐藏弹窗
					}
				});
			}

			// 防止弹窗点击关闭自身
			function setupPopupClickListener() {
				popupElement.addEventListener('click', (event) => {
					event.stopPropagation(); // 防止冒泡到 document
				});
			}

			function initializeMiniMap(container, lng, lat) {
				if (miniMap) {
					miniMap.remove(); // 如果 miniMap 已存在，先移除
				}

				// 创建新的容器
				const miniMapContainer = document.createElement('div');
				miniMapContainer.style.width = '100%';
				miniMapContainer.style.height = '100%';
				container.innerHTML = ''; // 清空旧的内容
				container.appendChild(miniMapContainer);

				// 初始化小地图
				miniMap = L.map(miniMapContainer).setView([lat, lng], 16);

				L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					attribution: '&copy; OpenStreetMap contributors',
					subdomains: ['a', 'b', 'c'],
				}).addTo(miniMap);
			}
			// 根据日期和轨迹 ID 加载轨迹数据
            function fetchTrackData(date, trackId) {
                const folder = document.getElementById('folder-picker').value;  // 获取文件夹（如 Dallas）
                const url = `/get_track_data?folder=${folder}&date=${date}&track_id=${trackId}`;

                console.log(`Requesting track data from: ${url}`);  // 打印请求的 URL

                return fetch(url)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Failed to load track data for ID ${trackId}`);
                        }
                        return response.text();
                    })
                    .then(data => parseTrackData(data))
                    .catch(error => {
                        console.error("Error fetching track data:", error);
                    });
            }



			// 解析轨迹数据
			function parseTrackData(data) {
				const points = [];
				const lines = data.split('\n');
				lines.forEach(line => {
					const [id, trackPoints] = line.split('|');
					if (trackPoints) {
						trackPoints.split(';').forEach(point => {
							const [time, lat, lon, speed, angle] = point.split(',');
							points.push({
								time,
								latitude: parseFloat(lat),
								longitude: parseFloat(lon),
								speed: parseFloat(speed),
								angle: parseFloat(angle),
							});
						});
					}
				});
				return points;
			}

			// 在地图上绘制轨迹
			function drawTrack(trackData, color, layerId) {
				if (!miniMap) {
					console.error("MiniMap is not initialized. Cannot draw tracks.");
					return;
				}

				// 清除旧的轨迹
				miniMap.eachLayer(layer => {
					if (layer instanceof L.Polyline && layer.options.id === layerId) {
						miniMap.removeLayer(layer);
					}
				});

				// 绘制新的轨迹
				const latLngs = trackData.map(point => [point.latitude, point.longitude]);

				// 创建轮廓线（细线）
				const outline = L.polyline(latLngs, {
					color: '#000', // 黑色轮廓
					weight: 1, // 轮廓线的宽度
					opacity: 0.8, // 轮廓线的透明度
					dashArray: '5,5', // 虚线样式
					id: `${layerId}-outline`,
				}).addTo(miniMap);

				// 创建填充线（透明的主轨迹线）
				const polyline = L.polyline(latLngs, {
					color: color, // 轨迹颜色
					weight: 6, // 主轨迹线的宽度
					opacity: 0.5, // 主轨迹线的透明度
					id: layerId,
				}).addTo(miniMap);
			}
			// 加载并显示两条轨迹
			function loadAndDisplayTracks(date, category1, category2, clickLat, clickLon) {
				// 创建进度条容器
				const progressBarContainer = document.createElement('div');
				progressBarContainer.style.position = 'absolute';
				progressBarContainer.style.top = '10px';
				progressBarContainer.style.left = '10px';
				progressBarContainer.style.width = '80%';
				progressBarContainer.style.height = '20px';
				progressBarContainer.style.backgroundColor = '#e0e0e0';
				progressBarContainer.style.borderRadius = '5px';
				progressBarContainer.style.zIndex = '1000';
				progressBarContainer.style.display = 'flex';
				progressBarContainer.style.alignItems = 'center';
				progressBarContainer.style.justifyContent = 'center';

				const progressBar = document.createElement('div');
				progressBar.style.width = '100%';
				progressBar.style.height = '5px';
				progressBar.style.backgroundColor = '#e0e0e0';
				progressBar.style.borderRadius = '5px';
				progressBar.style.overflow = 'hidden';
				progressBar.style.position = 'relative';

				const progress = document.createElement('div');
				progress.style.width = '0%';
				progress.style.height = '100%';
				progress.style.backgroundColor = '#76c7c0';
				progress.style.transition = 'width 0.3s ease';

				const progressText = document.createElement('span');
				progressText.style.color = '#000';
				progressText.style.fontSize = '12px';
				progressText.style.marginLeft = '10px';
				progressText.textContent = '0%';

				progressBar.appendChild(progress);
				progressBarContainer.appendChild(progressBar);
				progressBarContainer.appendChild(progressText);
				popupElement.querySelector('#minimap-container').appendChild(progressBarContainer);

				// 总任务数和已完成任务计数
				const totalTasks = 2; // 两条轨迹任务
				let completedTasks = 0;

				const updateProgress = () => {
					completedTasks++;
					const percent = Math.round((completedTasks / totalTasks) * 100);
					progress.style.width = `${percent}%`;
					progressText.textContent = `${percent}%`;
				};

				// 开始加载轨迹数据
				Promise.all([
					fetchTrackData(date, category1).then(data => {
						updateProgress();
						return data;
					}),
					fetchTrackData(date, category2).then(data => {
						updateProgress();
						return data;
					}),
				])
					.then(([trackData1, trackData2]) => {
						if (trackData1 && trackData2) {
							// 筛选点击点附近的轨迹数据
							const filteredTrack1 = filterTrackData(trackData1, clickLat, clickLon, 100);
							const filteredTrack2 = filterTrackData(trackData2, clickLat, clickLon, 100);

							// 分别绘制两条轨迹
							drawTrack(filteredTrack1, 'blue', 'track1');
							drawTrack(filteredTrack2, 'black', 'track2');
						} else {
							alert("Failed to load one or both tracks.");
						}
					})
					.catch(error => {
						console.error("Error loading track data:", error);
					})
					.finally(() => {
						// 加载完成后 500ms 移除进度条
						setTimeout(() => {
							progressBarContainer.remove();
						}, 500);
					});
			}


			function filterTrackData(trackData, lat, lon, count) {
				// 找到距离点击点最近的点
				let minDistance = Infinity;
				let closestIndex = -1;

				trackData.forEach((point, index) => {
					const distance = getDistance(lat, lon, point.latitude, point.longitude);
					if (distance < minDistance) {
						minDistance = distance;
						closestIndex = index;
					}
				});

				// 获取最近点前后各 count 个点
				const startIndex = Math.max(closestIndex - count, 0);
				const endIndex = Math.min(closestIndex + count, trackData.length);

				return trackData.slice(startIndex, endIndex);
			}

			// 计算两点之间的距离（Haversine 公式）
			function getDistance(lat1, lon1, lat2, lon2) {
				const R = 6371; // 地球半径，单位：公里
				const toRad = angle => (angle * Math.PI) / 180;
				const dLat = toRad(lat2 - lat1);
				const dLon = toRad(lon2 - lon1);
				const a =
					Math.sin(dLat / 2) * Math.sin(dLat / 2) +
					Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
				const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
				return R * c; // 返回距离，单位：公里
			}
			function clearMapLayers() {
				layers = []; // Clear the layers array
				updateLayerList(); // Update the layer list in the UI
				updateMapLayers(); // Refresh the map to show only the base layer
			}



			document.getElementById('folder-picker').addEventListener('change', function () {
                const selectedFolder = this.value;  // 获取用户选择的文件夹名

                // 清除地图和图层列表
                clearMapLayers();
            });
            function latLonToGrid(lat, lon, gridSize = gridSize) {
                return {
                    x: Math.floor(lon / gridSize),
                    y: Math.floor(lat / gridSize),
                };
            }

            // 聚合点并计算每个网格的权重
            function aggregatePointsByGrid(points, gridSize = gridSize) {
                const grid = {};
                const totalPoints = points.length;
                let processedPoints = 0;

                points.forEach(point => {
                    const [lon, lat, weight] = point;
                    const gridCoords = latLonToGrid(lat, lon, gridSize);
                    const key = `${gridCoords.x},${gridCoords.y}`;

                    if (!grid[key]) {
                        grid[key] = 0;
                    }

                    grid[key] += weight; // 聚合权重

                    // 更新进度
                    processedPoints++;
                    if (processedPoints % Math.floor(totalPoints / 100) === 0) {
                        const progress = Math.floor((processedPoints / totalPoints) * 100);
                        console.log(`Progress: ${progress}%`);
                    }
                });

                return grid;
            }

            function generateHeatMap() {
                const selectedLayerId = document.getElementById('layer-selector').value;
                if (!selectedLayerId) {
                    alert('Please select a layer to generate heat map.');
                    return;
                }
                // 获取用户输入的 TTC 范围
                const minTTC = parseFloat(document.getElementById('min-ttc').value);
                const maxTTC = parseFloat(document.getElementById('max-ttc').value);
                if (isNaN(minTTC) || isNaN(maxTTC)) {
                    alert('Please enter a valid TTC range.');
                    return;
                }

                // 查找选中的图层
                const selectedLayerInfo = layers.find(layer => layer.id === selectedLayerId);
                if (!selectedLayerInfo) {
                    alert('Selected layer not found.');
                    return;
                }

                // 获取图层的 GeoJSON 数据
                const geojson = selectedLayerInfo.layer.props.data;


                // 提取点的经纬度并为每个点指定权重，筛选出 TTC 在指定范围内的点
                const points = geojson.features.map(feature => {
                    const [longitude, latitude] = feature.geometry.coordinates;
                    const weight = feature.properties.weight || 1; // 为每个点设置权重
                    const ttc = feature.properties.TTC; // 假设 TTC 是图层属性中的一个列名

                    // 筛选 TTC 在指定范围内的点
                    if (ttc >= minTTC && ttc <= maxTTC) {
                        return [longitude, latitude, weight];
                    }
                    return null;  // 返回 null 代表此点不在指定范围内
                }).filter(point => point !== null);  // 过滤掉 null 的点

                console.log("Heatmap Data: ", points);

                const colorDomain = [0, 2, 4, 6, 8, 10]; // 权重值分段，依赖于您的数据和热力图的效果
                const colorRange = [
                    [255, 102, 102, 255], // 红色
                    [255, 51, 51, 255],   // 深红色
                    [255, 0, 0, 255],     // 强烈的红色
                    [255, 204, 51, 255],  // 明黄色
                    [255, 255, 0, 255],   // 亮黄色
                    [255, 255, 102, 255]  // 浅黄色
                ];



                // 将点的权重值映射到分段区间
                const heatMapData = points.map(point => {
                    let weight = point[2];

                    // 确定点的颜色区间
                    let colorIndex = 0;
                    for (let i = 0; i < colorDomain.length - 1; i++) {
                        if (weight >= colorDomain[i] && weight < colorDomain[i + 1]) {
                            colorIndex = i;
                            break;
                        }
                    }

                    return [point[0], point[1], weight]; // 返回点的经纬度和权重
                });

                // 创建热力图图层
                const heatMapLayer = new deck.HeatmapLayer({
                    id: `heatmap-${selectedLayerId}`,
                    data: heatMapData,
                    getPosition: d => d,
                    getWeight: d => d[2],
                    radiusPixels: 40,         // 增大热力点半径
                    intensity: 3,            // 增强热力强度
                    threshold: 0.05,         // 降低热力阈值
                    opacity: 0.8,
                    colorRange: colorRange,   // 使用分段颜色映射
                    colorDomain: colorDomain, // 使用分段的权重范围
                });

                // 将热力图图层添加到地图
                heatMapLayers.push({
                    id: `heatmap-${selectedLayerId}`,
                    name: `Heatmap of ${selectedLayerInfo.name}`,
                    layer: heatMapLayer,
                });

                // 更新热力图图层列表
                updateHeatMapLayerList();

                // 更新热力图图层列表
                updateHeatMapLayerList();

                // 获取所有可见的普通图层
                const visibleLayers = layers.filter(layerInfo => layerInfo.visible).map(layerInfo => layerInfo.layer);
                // 获取所有可见的热力图图层
                const visibleHeatMapLayers = heatMapLayers.map(heatMapLayerInfo => heatMapLayerInfo.layer);

                // 更新地图图层，包含底图、其他可见图层和热力图图层
                deckMap.setProps({
                    layers: [
                        new deck.TileLayer({
                            id: 'tile-layer',
                            data: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            minZoom: 0,
                            maxZoom: 19,
                            tileSize: 256,
                            renderSubLayers: (props) => {
                                const { bbox: { west, south, east, north } } = props.tile;
                                const { x, y, z } = props.tile;
                                const id = `bitmap-layer-${z}-${x}-${y}`;
                                return new deck.BitmapLayer({
                                    id: id,
                                    data: null,
                                    image: props.data,
                                    bounds: [west, south, east, north],
                                });
                            },
                        }),
                        ...visibleLayers, // 保留其他可见图层
                        ...visibleHeatMapLayers, // 添加热力图图层
                    ],
                });
            }
            function updateHeatMapLayerList() {
                const heatMapLayerList = document.getElementById('heatMapLayerList');
                heatMapLayerList.innerHTML = ''; // 清空现有列表

                heatMapLayers.forEach((heatMapLayerInfo) => {
                    const li = document.createElement('li');
                    li.style.display = 'flex';
                    li.style.alignItems = 'center';
                    li.style.marginBottom = '5px';

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = heatMapLayerInfo.name;

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Delete';
                    deleteButton.style.marginLeft = '10px';
                    deleteButton.onclick = () => {
                        heatMapLayers = heatMapLayers.filter((l) => l.id !== heatMapLayerInfo.id);
                        updateHeatMapLayerList();
                        updateMapLayers();
                    };

                    li.appendChild(nameSpan);
                    li.appendChild(deleteButton);
                    heatMapLayerList.appendChild(li);


                });
            }

            initializeMap();
