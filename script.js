// Initialize html elements
let debugDiv = document.getElementById("debug");
let canvas = document.getElementById("game-canvas");
let scoreSpan = document.getElementById("score");
let startPopup = document.getElementById("start-popup");
let solvedPopup = document.getElementById("solved-popup");
let topBar = document.getElementById("top-bar");
let sensitivitySlider = document.getElementById("sensitivity-slider");
let difficultySlider = document.getElementById("difficulty-slider");
let generationSpeedSlider = document.getElementById("generation-speed-slider");
let generationSpeedCheckbox = document.getElementById("generation-speed-checkbox");
let randomColorsCheckbox = document.getElementById("random-colors-checkbox");
let engine = null;
let score = 0;

let mazeBuildDelay = 0;
let updateWallTimeouts = [];

// Load the Matter.js script
const script = document.createElement("script");
script.src = "./matter.js";
script.onload = initializeMatter;   // Function to call after script is loaded
document.head.appendChild(script);

window.onload = () => {
    // Hide the popup screen after 1 second
    setTimeout(() => {
        startPopup.style.opacity = 0;
        setTimeout(() => startPopup.style.visibility = "collapse", 1000);

        initInput()
    }, 1000);
};

// Init settings popup
document.addEventListener("click", function (event) {
    const settingsPopup = document.getElementById("settings-popup");
    if (!settingsPopup.contains(event.target) && event.target.className !== "settings-icon") {
        settingsPopup.style.display = "none";
    }
});

addEventListener("resize", onResize);

function onResize() {
    // Reset whole game when the screen is resized
    initializeMatter();
}

function toggleSettingsPopup() {
    const settingsPopup = document.getElementById("settings-popup");
    settingsPopup.style.display = (settingsPopup.style.display === "block") ? "none" : "block";
}

// initialize gravity sensor or joystick
function initInput() {
    let permissions = [{
        name: "accelerometer",
        onSuccess: () => {
            let gravitySensorSettings = { frequency: 60 };
            let gravitySensor = new GravitySensor(gravitySensorSettings);

            // Enable joystick anyway in case the sensor is not working
            // but disable joystick again when there is any input from the sensor
            enableJoystick();
            gravitySensor.addEventListener("reading", (e) => {
                disableJoystick();

                // x needs to be inverted for some reason
                if (window.screen.orientation.angle % 180 === 0) {
                    updateBall({
                        x: -e.target.x,
                        y: e.target.y
                    });
                } else {
                    if (window.screen.orientation.angle === 90) {
                        updateBall({
                            x: e.target.y,
                            y: e.target.x
                        });
                    } else {
                        updateBall({
                            x: -e.target.y,
                            y: -e.target.x
                        });
                    }
                }
            });

            gravitySensor.start();
        },
        onError: () => {
            enableJoystick();
        }
    }];

    requestPermission(permissions);
}

// Initialize canvas and the physics engine
function initializeMatter() {
    // module aliases
    let Engine = Matter.Engine,
        Events = Matter.Events,
        Render = Matter.Render,
        Runner = Matter.Runner,
        Bodies = Matter.Bodies,
        Composite = Matter.Composite;

    // Create an engine
    engine = Engine.create();

    engine.gravity.scale = 0.0002;
    engine.gravity.x = 0;
    engine.gravity.y = 0;

    let width = document.documentElement.clientWidth;
    let height = document.documentElement.clientHeight - topBar.clientHeight;

    let doubleWidth = width * 2;
    let doubleHeight = height * 2;

    // Create a renderer
    let render = Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: width,
            height: height,
            wireframes: false,
        }
    });

    let gridSizeX = 0,
        gridSizeY = 0,
        length = 0
    updateGridSize(difficultySlider.value);

    let ballComposite = Composite.create({ label: "Ball" });
    let destinationComposite = Composite.create({ label: "Destination" });
    let boundaryComposite = Composite.create({ label: "Boundaries" });
    let wallsComposite = Composite.create({ label: "Walls" });

    Composite.add(engine.world, [wallsComposite, boundaryComposite, ballComposite, destinationComposite]);

    // Choose a random starting point
    addBall(getRandomStartPoint());

    // Choose a random end point
    let destination
    addDestination(getRandomEndPoint());

    // Create the boundaries
    let top = Bodies.rectangle(0, 0, doubleWidth, 1, { isStatic: true });
    let bottom = Bodies.rectangle(0, height, doubleWidth, 1, { isStatic: true });
    let left = Bodies.rectangle(0, 0, 1, doubleHeight, { isStatic: true });
    let right = Bodies.rectangle(width, 0, 1, doubleHeight, { isStatic: true });
    Composite.add(boundaryComposite, [top, bottom, left, right]);

    // Run the renderer
    Render.run(render);

    // Create runner
    let runner = Runner.create();

    // Run the engine
    Runner.run(runner, engine);

    Events.on(engine, "collisionStart", (event) => {
        const pairs = event.pairs;

        pairs.forEach((pair) => {
            // Check if the destination is involved in the collision
            if (pair.bodyA === destination || pair.bodyB === destination) {
                nextLevel()
            }
        });
    });

    generateMaze();

    difficultySlider.addEventListener("input", updateDifficulty);
    generationSpeedSlider.addEventListener("input", updateGenerationSpeed);
    generationSpeedCheckbox.addEventListener("change", updateGenerationSpeed);

    let timeoutId;

    function updateDifficulty() {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(async () => {
            updateGridSize(difficultySlider.value);

            addBall(getRandomStartPoint());
            addDestination(getRandomEndPoint());

            await generateMaze();
        }, 300);
    }

    function updateGenerationSpeed() {
        const minValue = 1.01;
        const maxValue = 10000;
        if (generationSpeedCheckbox.checked) {
            let value = (maxValue - minValue) * (1 - generationSpeedSlider.value) + minValue;
            let log = Math.log(value);
            mazeBuildDelay = log * log;
        } else {
            mazeBuildDelay = 0;
        }
    }

    function updateGridSize(y) {
        gridSizeY = y;
        length = Math.floor(height / gridSizeY);
        gridSizeX = Math.floor(width / length);
    }

    function addBall(positionOnGrid) {
        let positionOnCanvas = getCenterOfCell(positionOnGrid);
        let radius = length / 2 - length / 8;
        let ball = Bodies.circle(
            positionOnCanvas.x,
            positionOnCanvas.y,
            radius,
            {
                render: {
                    fillStyle: "#F35E66",
                }
            });

        Composite.clear(ballComposite);
        Composite.add(ballComposite, ball);
    }

    function addDestination(positionOnGrid) {
        let positionOnCanvas = getCenterOfCell(positionOnGrid);
        let dest = Bodies.rectangle(
            positionOnCanvas.x,
            positionOnCanvas.y,
            length,
            length,
            {
                isStatic: true,
                render: {
                    fillStyle: "#00FF00",
                }
            }
        );

        Composite.clear(destinationComposite);
        Composite.add(destinationComposite, dest);

        destination = dest;
    }

    let isIncreasingLevel = false;

    function nextLevel() {
        if (isIncreasingLevel) return;

        isIncreasingLevel = true;

        solvedPopup.style.visibility = "visible";
        setTimeout(() => {
            // Move the ball to a random starting point
            addBall(getRandomStartPoint());
            solvedPopup.style.visibility = "collapse";
        }, 1000);

        score++;
        scoreSpan.innerHTML = score;

        generateMaze();

        // Move the destination to a random end point
        addDestination(getRandomEndPoint());

        // Reset ball position
        addBall(getRandomStartPoint());

        isIncreasingLevel = false;
    }

    function getRandomStartPoint() {
        return {
            x: Math.floor(Math.random() * (gridSizeX - 1) / 2),
            y: Math.floor(Math.random() * (gridSizeY - 1) / 2),
        };
    }

    function getRandomEndPoint() {
        if (Math.random() < 0.5) {
            return {
                x: Math.floor((Math.random() * 0.5 + 0.5) * gridSizeX),
                y: Math.floor(gridSizeY - 1),
            };
        } else {
            return {
                x: Math.floor(gridSizeX - 1),
                y: Math.floor((Math.random() * 0.5 + 0.5) * gridSizeY),
            };
        }
    }

    function getCenterOfCell(coords) {
        return {
            x: coords.x * length + length / 2,
            y: coords.y * length + length / 2,
        };
    }

    function isInBounds(x, y) {
        return x >= 0 && x < gridSizeX && y >= 0 && y < gridSizeY;
    }

    // add walls to the maze by adding rectangles to the world
    async function generateMaze() {
        let colorSeed = Math.random();

        log(`Grid size: ${gridSizeX} x ${gridSizeY}`);

        for (const updateWallTimeout of updateWallTimeouts) {
            clearTimeout(updateWallTimeout);
        }

        // Use a version of Kruskal's algorithm for maze generation
        let groupsCounter = 0;
        let groups = [];

        // Initialize sets for each cell
        const cells = [];
        for (let x = 0; x < gridSizeX; x++) {
            cells[x] = [];
            for (let y = 0; y < gridSizeY; y++) {
                cells[x][y] = {
                    group: null,
                    bottomWall: true,
                    rightWall: true,
                };
            }
        }

        // Shuffle the cells randomly
        shuffle2D(cells);

        // Remove walls until all cells are connected
        for (let x = 0; x < cells.length; x++) {
            for (let y = 0; y < cells[x].length; y++) {
                // randomly choose a neighbor
                let neighbors = shuffle([
                    // left
                    {
                        x: x - 1,
                        y: y,
                    },
                    // right
                    {
                        x: x + 1,
                        y: y,
                    },
                    // top
                    {
                        x: x,
                        y: y - 1,
                    },
                    // bottom
                    {
                        x: x,
                        y: y + 1,
                    },
                ]);

                let groupIsNull = cells[x][y].group === null;

                for (const neighbor of neighbors) {
                    if (!isInBounds(neighbor.x, neighbor.y)) continue;
                    if (!groupIsNull && cells[x][y].group === cells[neighbor.x][neighbor.y].group) continue;

                    await mergeCells(x, y, neighbor.x, neighbor.y);
                    break;
                }
            }
        }

        drawWalls();

        // Function to merge two cells
        async function mergeCells(x1, y1, x2, y2) {
            let groupA = cells[x1][y1].group;
            let groupB = cells[x2][y2].group;

            // Merge the two groups
            if (groupA === null) {
                if (groupB === null) {
                    cells[x1][y1].group = groupsCounter;
                    cells[x2][y2].group = groupsCounter;
                    groups.push(groupsCounter);
                    groupsCounter++;
                } else {
                    cells[x1][y1].group = groupB;
                }
            } else if (groupB === null) {
                cells[x2][y2].group = groupA;
            } else {
                // Merge the two existing groups
                for (const column of cells) {
                    for (const cell of column) {
                        if (cell.group === groupB) {
                            cell.group = groupA;
                        }
                    }
                }

                groups = groups.filter(item => item !== groupB);
            }

            // Remove a wall between the two cells
            if (x1 === x2) {
                if (y1 < y2) {
                    cells[x1][y1].bottomWall = false;
                } else {
                    cells[x2][y2].bottomWall = false;
                }
            } else {
                if (x1 < x2) {
                    cells[x1][y1].rightWall = false;
                } else {
                    cells[x2][y2].rightWall = false;
                }
            }

            if (mazeBuildDelay > 0) {
                drawWalls();
                await new Promise(r => updateWallTimeouts.push(setTimeout(r, mazeBuildDelay)));
            }
        }

        function drawWalls() {
            let maze = [];
            let wallSize = Math.min(10, length / 4 - 1);

            for (let x = 0; x < gridSizeX; x++) {
                for (let y = 0; y < gridSizeY; y++) {
                    let cell = cells[x][y];

                    if (cell.bottomWall) {
                        maze.push(Bodies.rectangle(x * length + length / 2, (y + 1) * length, length + wallSize, wallSize, {
                            isStatic: true,
                            render: {
                                fillStyle: getWallColor(x, y)
                            }
                        }));
                    }
                    if (cell.rightWall) {
                        maze.push(Bodies.rectangle((x + 1) * length, y * length + length / 2, wallSize, length + wallSize, {
                            isStatic: true,
                            render: {
                                fillStyle: getWallColor(x, y)
                            }
                        }));
                    }
                }
            }

            Composite.clear(wallsComposite);
            Composite.add(wallsComposite, maze);
            return maze;

            function getWallColor(x, y) {
                if (randomColorsCheckbox.checked) {
                    return getRandomColor(colorSeed, x, y);
                } else {
                    return "#ffffff";
                }
            }
        }
    }
}

function updateBall(direction) {
    if (engine == null) return;

    const minSensitivity = 0.01;
    const maxSensitivity = 0.5;

    // x needs to be inverted for some reason
    engine.gravity.x = direction.x * map01(sensitivitySlider.value, minSensitivity, maxSensitivity);
    engine.gravity.y = direction.y * map01(sensitivitySlider.value, minSensitivity, maxSensitivity);
    log(`X: ${engine.gravity.x.toFixed(2)} Y: ${engine.gravity.y.toFixed(2)}`);
}

// request permission for a sensor
function requestPermission(permissions) {
    for (const permission of permissions) {
        navigator.permissions
            .query({ name: permission.name })
            .then((result) => {
                if (result.state === "denied") {
                    permission.onError()
                } else if (result.state === "granted") {
                    permission.onSuccess();
                }
            })
            .catch((error) => {
                permission.onError();
            });
    }
}

// disable joystick
function disableJoystick() {
    if (joystick.style.visibility === "visible") {
        joystick.style.visibility = "collapse";
    }
}

// enable joystick
function enableJoystick() {
    const joystick = document.getElementById("joystick");
    const handle = document.getElementById("handle");
    let isDragging = false;
    joystick.style.visibility = "visible";
    joystick.addEventListener("mousedown", startDrag);
    joystick.addEventListener("touchstart", startDrag);

    function startDrag(e) {
        isDragging = true;
        updateHandlePosition(e);
        document.addEventListener("mousemove", updateHandlePosition);
        document.addEventListener("touchmove", updateHandlePosition);
        document.addEventListener("mouseup", stopDrag);
        document.addEventListener("touchend", stopDrag);
        e.preventDefault(); // Prevent default behavior for touch events
    }

    function stopDrag() {
        isDragging = false;
        document.removeEventListener("mousemove", updateHandlePosition);
        document.removeEventListener("touchmove", updateHandlePosition);
        document.removeEventListener("mouseup", stopDrag);
        document.removeEventListener("touchend", stopDrag);
        resetHandlePosition();
    }

    function updateHandlePosition(e) {
        if (isDragging) {
            const boundingRect = joystick.getBoundingClientRect();
            let x, y;

            if (e.type === "touchmove") {
                x = e.touches[0].clientX - boundingRect.left;
                y = e.touches[0].clientY - boundingRect.top;
            } else {
                x = e.clientX - boundingRect.left;
                y = e.clientY - boundingRect.top;
            }

            const distance = Math.min(
                joystick.clientWidth / 2,
                Math.sqrt((x - joystick.clientWidth / 2) ** 2 + (y - joystick.clientHeight / 2) ** 2));

            const angle = Math.atan2(
                y - joystick.clientHeight / 2,
                x - joystick.clientWidth / 2);

            const offsetX = distance * Math.cos(angle);
            const offsetY = distance * Math.sin(angle);

            let mult = 3;
            updateBall({
                x: offsetX / joystick.clientWidth * mult,
                y: offsetY / joystick.clientHeight * mult
            });

            handle.style.transform = `translate(50%, 50%) translate(${offsetX}px, ${offsetY}px)`;
        }
    }

    function resetHandlePosition() {
        updateBall({
            x: 0,
            y: 0
        });
        handle.style.transform = "translate(50%, 50%)";
    }
}

// get a random color
function getRandomColor(seed, x, y) {
    const letters = "0123456789ABCDEF";
    let color = "#";

    for (let i = 0; i < 6; i++) {
        // Random number using a seed and x and y coordinates to have a deterministic number
        let random = Math.sin(seed + x * 12.9898 + y * 78.233) * 43758.5453 * (i + 1);
        random = random - Math.floor(random);
        color += letters[Math.floor(random * 16)];
        console.log(Math.floor(random * 16));
    }

    return color;
}

// log a message to the debug div
function log(message) {
    debugDiv.innerHTML = message;
}

// map a value from one range to another
function map(value, min1, max1, min2, max2) {
    return (value - min1) * (max2 - min2) / (max1 - min1) + min2;
}

// map from a range between 0 and 1
function map01(value, min, max) {
    return map(value, 0, 1, min, max);
}

// shuffle items in an array
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const random = Math.floor(Math.random() * (i + 1));

        [array[i], array[random]] = [array[random], array[i]];
    }

    return array;
}

// shuffle items in a 2D array
function shuffle2D(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * i);

        for (let k = 0; k < array[i].length; k++) {
            [array[i][k], array[j][k]] = [array[j][k], array[i][k]];
        }
    }

    return array;
}
