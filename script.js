// Initialize the chart with more detailed configuration
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: 1200,
    height: 600,
    layout: {
        background: { color: '#000000' },
        textColor: '#595656',
    },
    grid: {
        vertLines: { color: '#cfcaca', visible: false },
        horzLines: { color: '#bfb7b7', visible: false },
    },



    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    },
    crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,

        vertLine: {
            color: '#afaaaf',
            labelBackgroundColor: '#afaaaf',
        },

        horzLine: {
            color: '#afaaaf',
            labelBackgroundColor: '#afaaaf',
        },
    },
});

const candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350'
});

chart.subscribeCrosshairMove((param) => {
    const ohlcTooltip = document.getElementById('ohlcTooltip');

    if (!param || !param.seriesData) {
        ohlcTooltip.style.display = 'none'; // Hide the tooltip when no data is available
        return;
    }

    const data = param.seriesData.get(candleSeries);
    if (!data) {
        ohlcTooltip.style.display = 'none'; // Hide the tooltip if no candlestick data is found
        return;
    }

    const { open, high, low, close } = data;

    // Show and populate the tooltip
    ohlcTooltip.style.display = 'block';
    const openCloseDiff = close - open;
    const openClosePercent = (openCloseDiff / open) * 100;
    ohlcTooltip.textContent = `O: ${open.toFixed(2)} H: ${high.toFixed(2)} L: ${low.toFixed(2)} C: ${close.toFixed(2)} ${openCloseDiff.toFixed(2)} (${openClosePercent.toFixed(2)}%)`;
});



let firstWebSocketTimestamp = null;

async function fetchKlineData(endTimestamp) {
    console.log("Fetching Kline Data...");

    const endpoint = `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=1&start=1731232860000&end=${endTimestamp}&limit=100`;

    try {
        const response = await fetch(endpoint);
        console.log("Response status:", response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Fetched data:", data);

        if (data.retCode === 0 && data.result && data.result.list) {
            console.log("Valid data received. Processing kline data...");

            const klines = data.result.list
                .map(kline => {
                    // Ensure all required values are present and valid
                    if (!kline || kline.length < 5) {
                        console.warn("Invalid kline data entry:", kline);
                        return null;
                    }

                    const time = parseInt(kline[0]);
                    const open = parseFloat(kline[1]);
                    const high = parseFloat(kline[2]);
                    const low = parseFloat(kline[3]);
                    const close = parseFloat(kline[4]);

                    // Validate that all values are valid numbers
                    if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
                        console.warn("Invalid numeric values in kline:", kline);
                        return null;
                    }

                    return {
                        time: time / 1000, // Convert ms to seconds
                        open,
                        high,
                        low,
                        close
                    };
                })
                .filter(kline => kline !== null) // Remove any invalid entries
                .sort((a, b) => a.time - b.time); // Ensure proper time ordering

            console.log("Processed and validated klines:", klines);

            if (klines.length === 0) {
                console.error("No valid historical data to display.");
                return;
            }

            // Set the data and update the table
            candleSeries.setData(klines);

        } else {
            throw new Error(`API error: ${data.retMsg}`);
        }
    } catch (error) {
        console.error('Error in fetchKlineData:', error);
    }
}


const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');

ws.onopen = () => {
    console.log('WebSocket connected');
    ws.send(JSON.stringify({
        "op": "subscribe",
        "args": ["kline.1.BTCUSDT"]
    }));
};

ws.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);
        if (message.topic && message.topic.startsWith('kline.')) {
            const klineData = message.data[0];

            if (klineData && !klineData.confirm) {
                // Save the first timestamp from WebSocket message
                if (!firstWebSocketTimestamp) {
                    firstWebSocketTimestamp = klineData.start;
                    console.log("First WebSocket timestamp saved:", firstWebSocketTimestamp);
                }

                const updateData = {
                    time: klineData.start / 1000,
                    open: parseFloat(klineData.open),
                    high: parseFloat(klineData.high),
                    low: parseFloat(klineData.low),
                    close: parseFloat(klineData.close),
                };

                // Validate the update data
                if (Object.values(updateData).every(value => !isNaN(value))) {
                    candleSeries.update(updateData);

                    const livePriceElement = document.getElementById('livePrice');
                    if (livePriceElement) {
                        livePriceElement.innerText = parseFloat(klineData.close).toFixed(2);
                    }
                } else {
                    console.warn('Invalid data received from WebSocket:', klineData);
                }
            }
        }
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
    }
};

ws.onclose = () => console.log('WebSocket connection closed');
ws.onerror = (error) => console.error('WebSocket error:', error);

// Initial data fetch using the stored WebSocket timestamp, or fallback to current time if null
const currentTimeInMillis = Date.now();
const endTimestamp = firstWebSocketTimestamp || currentTimeInMillis;
fetchKlineData(endTimestamp);