
		  
		  await page.evaluate(() => {
        const cursor = document.createElement('div');
        cursor.id = 'virtual-cursor';
        cursor.style.width = '16px';
        cursor.style.height = '16px';
        cursor.style.borderRadius = '10px';
        cursor.style.backgroundColor = 'red';
        cursor.style.position = 'absolute';
        cursor.style.zIndex = '10000';
        cursor.style.pointerEvents = 'none'; // Чтобы курсор не блокировал клики
        document.body.appendChild(cursor);
    
        window.moveVirtualCursor = (x, y) => {
            cursor.style.left = `${x}px`;
            cursor.style.top = `${y}px`;
        };
    });
          
            const moveCursor = async (page, stepsRange = { min: 24, max: 38 }, movements = 8) => {
        const rect = await page.evaluate(() => {
            return {
                width: document.documentElement.clientWidth,
                height: document.documentElement.clientHeight,
            };
        });
    
        let currentX = randomBetween(100, rect.width - 100);
        let currentY = randomBetween(131, rect.height - 100);
    
        for (let i = 0; i < movements; i++) {
            const x = randomBetween(100, rect.width - 100);
            const y = randomBetween(131, rect.height - 100);
            const steps = randomBetween(stepsRange.min, stepsRange.max);
            const delayBetweenMovements = randomBetween(100, 2650); // Задержка от 100 мс до 5 сек
    
            for (let step = 1; step <= steps; step++) {
                const stepX = (x - currentX) * step / steps + currentX;
                const stepY = (y - currentY) * step / steps + currentY;
    
                // Обновление виртуального и "реального" курсоров
                await page.mouse.move(stepX, stepY);
                await page.evaluate((x, y) => {
                    window.moveVirtualCursor(x, y);
    
                    // Создаем следы курсора
                    const trail = document.createElement('div');
                    trail.style.position = 'absolute';
                    trail.style.left = `${x - 5}px`; // Смещаем, чтобы след был по центру курсора
                    trail.style.top = `${y - 5}px`; // Смещаем, чтобы след был по центру курсора
                    trail.style.width = '3px'; // Размер следа
                    trail.style.height = '3px'; // Размер следа
                    trail.style.backgroundColor = 'blue'; // Цвет следа
                    trail.style.borderRadius = '50%'; // Делаем след круглым
                    trail.style.opacity = '0.5'; // Немного прозрачный
                    document.body.appendChild(trail);
                }, stepX, stepY);
                await new Promise(r => setTimeout(r, 1)); // Небольшая задержка для плавности
    
                if (step === steps) {
                    currentX = stepX;
                    currentY = stepY;
                }
            }
    
            // Добавляем рандомную задержку между перемещениями
            if (i < movements - 1) { // Проверяем, чтобы не ждать после последнего перемещения
                await new Promise(r => setTimeout(r, delayBetweenMovements));
            }
        }
    };
    
    
    
    // Плавное перемещение виртуального курсора по разным координатам на экране
    await moveCursor(page);
    console.log('done');
    return;