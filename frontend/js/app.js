const app = {
    currentView: 'dashboard',
    currentBook: null,
    books: [],
    
    init() {
        this.setupTheme();
        
        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker Registered'))
                .catch(err => console.log('Service Worker Failed:', err));
        }

        // Handle Hash Routing
        window.addEventListener('hashchange', () => this.handleRouting());
        this.handleRouting();
    },

    handleRouting() {
        const hash = window.location.hash.slice(1);
        if (!hash) {
            this.navigate('dashboard', null, false);
            return;
        }
        
        const parts = hash.split('/');
        const view = parts[0];
        const id = parts[1] ? parseInt(parts[1]) : null;
        this.navigate(view, id, false);
    },

    setupTheme() {
        const theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-bs-theme', theme);
        this.updateThemeIcon(theme);
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-bs-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-bs-theme', next);
        localStorage.setItem('theme', next);
        this.updateThemeIcon(next);
    },

    updateThemeIcon(theme) {
        const icon = document.getElementById('themeIcon');
        if(theme === 'dark') {
            icon.className = 'bi bi-sun';
        } else {
            icon.className = 'bi bi-moon-stars';
        }
    },

    navigate(viewId, bookId = null, updateHash = true) {
        document.querySelectorAll('.app-view').forEach(v => {
            v.classList.add('d-none');
            v.classList.remove('d-flex');
        });
        
        const targetView = document.getElementById(`view-${viewId}`);
        if(targetView) {
            targetView.classList.remove('d-none');
            if(viewId === 'chat') targetView.classList.add('d-flex');
        }
        
        this.currentView = viewId;
        
        if (updateHash) {
            let hash = `#${viewId}`;
            if (bookId) hash += `/${bookId}`;
            // Use pushState to avoid triggering hashchange recursively
            window.history.pushState(null, null, hash);
        }

        if (viewId === 'dashboard') {
            this.loadBooks();
            if (this.init3DLibrary && !this.engine3D.active) {
                // Delay slightly to let DOM render
                setTimeout(() => this.init3DLibrary(), 50);
            }
        } else {
            // Stop 3D engine if leaving dashboard
            if (this.stop3DLibrary) this.stop3DLibrary();
        }

        if (viewId === 'reader' && bookId) {
            localStorage.setItem(`lastRead_${bookId}`, Date.now());
            this.loadBookDetails(bookId);
        } else if (viewId === 'quizzes') {
            this.loadQuizzes();
        }
    },

    async loadBooks() {
        try {
            this.books = await api.getBooks();
            this.renderBooksGrid();
        } catch (e) {
            console.error("Failed to load books", e);
            document.getElementById('books-grid').innerHTML = `<div class="alert alert-danger">Failed to load library. Is the backend running?</div>`;
        }
    },

    calculateUserLevel() {
        let totalXp = 0;
        let tagsCount = {};
        
        // Calculate XP and Tag Mastery
        this.books.forEach(b => {
            totalXp += 50; // base per book
            totalXp += (b.chapter_count || 0) * 10;
            if (b.complexity) totalXp += b.complexity * 5;
            
            if (b.tags) {
                b.tags.forEach(t => {
                    const tagLower = t.toLowerCase();
                    tagsCount[tagLower] = (tagsCount[tagLower] || 0) + 1;
                });
            }
        });
        
        const level = Math.floor(totalXp / 200) + 1;
        const currentLevelXp = totalXp % 200;
        const xpProgress = (currentLevelXp / 200) * 100;
        
        let tierClass = 'shelf-tier-wood';
        let tierName = 'Wood Tier';
        if (level >= 5) {
            tierClass = 'shelf-tier-cyber';
            tierName = 'Cyber Tier';
        } else if (level >= 3) {
            tierClass = 'shelf-tier-metal';
            tierName = 'Metal Tier';
        }

        // Update UI
        ['', '-mobile'].forEach(suffix => {
            const badge = document.getElementById(`user-level-badge${suffix}`);
            if (badge) badge.innerText = level;
            const tLabel = document.getElementById(`user-tier-label${suffix}`);
            if (tLabel) tLabel.innerText = tierName;
            const xpLabel = document.getElementById(`user-xp-label${suffix}`);
            if (xpLabel) xpLabel.innerText = `${totalXp} XP`;
            const bar = document.getElementById(`user-xp-bar${suffix}`);
            if (bar) bar.style.width = `${xpProgress}%`;
        });
        
        return { tierClass, tagsCount };
    },

    getStringHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return hash;
    },

    getBookColor(title) {
        const colors = [
            0xc62828, // red
            0x1565c0, // blue
            0x2e7d32, // green
            0x6a1b9a, // purple
            0xd84315, // orange
            0x283593, // indigo
            0x00695c, // teal
            0x4e342e  // brown
        ];
        const index = Math.abs(this.getStringHash(title)) % colors.length;
        return colors[index];
    },

    engine3D: {
        active: false,
        scene: null,
        camera: null,
        renderer: null,
        controls: null,
        raycaster: null,
        mouse: null,
        rafId: null,
        objects: [], // Collidable floor/walls
        racks: [], // Data struct for 3D racks
        interactiveBooks: [], // { mesh, bookData }
        mixers: [], // For animations if needed
        prevTime: performance.now(),
        velocity: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        keys: { forward: false, backward: false, left: false, right: false }
    },

    init3DLibrary() {
        if (this.engine3D.active) return;
        
        const canvas = document.getElementById('three-canvas');
        if (!canvas || !window.THREE) return;
        
        this.engine3D.active = true;
        
        // 1. Scene Setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e); // Dark academia ambient
        scene.fog = new THREE.FogExp2(0x1a1a2e, 0.015);
        this.engine3D.scene = scene;

        // 2. Camera Setup
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 1.6, 10); // 1.6m high (eye level)
        this.engine3D.camera = camera;

        // 3. Renderer Setup
        const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.engine3D.renderer = renderer;

        // 4. Lighting - Make it cozy!
        const ambientLight = new THREE.AmbientLight(0xffecd2, 0.4); // Warm ambient
        scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffd59e, 1.2, 100); // Warm bulb
        pointLight.position.set(0, 7, 0);
        pointLight.castShadow = true;
        scene.add(pointLight);
        
        // Desk lamp light
        const spotLight = new THREE.SpotLight(0xffa500, 1.5);
        spotLight.position.set(-6, 4, -12);
        spotLight.angle = Math.PI / 4;
        spotLight.penumbra = 0.8;
        spotLight.castShadow = true;
        scene.add(spotLight);

        // 5. Build Environment
        this.build3DRoom();

        // 6. Controls
        const controls = new THREE.PointerLockControls(camera, document.body);
        this.engine3D.controls = controls;

        const startOverlay = document.getElementById('start-overlay');
        startOverlay.addEventListener('click', () => {
             controls.lock();
        });

        controls.addEventListener('lock', () => {
            startOverlay.classList.add('d-none');
            document.getElementById('crosshair').classList.remove('d-none');
        });

        controls.addEventListener('unlock', () => {
            startOverlay.classList.remove('d-none');
            document.getElementById('crosshair').classList.add('d-none');
            document.getElementById('book-tooltip').classList.add('d-none');
        });

        scene.add(controls.getObject());

        // Keyboard bindings
        this.onKeyDown = (e) => this.handleKey3D(e.code, true);
        this.onKeyUp = (e) => this.handleKey3D(e.code, false);
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);

        // Resize handler
        this.onWindowResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', this.onWindowResize);

        // Interaction Check (Raycaster)
        this.engine3D.raycaster = new THREE.Raycaster();
        this.engine3D.mouse = new THREE.Vector2(0, 0); // Always center for FPS
        
        // Native Click listener for shooting the ray
        this.onClick = () => this.handleInteractionClick();
        document.addEventListener('click', this.onClick);

        // 7. Render Books and Racks
        this.render3DBookshelves();

        // 8. Start Loop
        this.engine3D.prevTime = performance.now();
        this.animate3D();
    },

    stop3DLibrary() {
        if (!this.engine3D.active) return;
        this.engine3D.active = false;
        if (this.engine3D.rafId) cancelAnimationFrame(this.engine3D.rafId);
        
        if (this.engine3D.controls) this.engine3D.controls.unlock();
        
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('resize', this.onWindowResize);
        document.removeEventListener('click', this.onClick);
        
        // Clean memory
        this.engine3D.interactiveBooks = [];
        this.engine3D.racks = [];
        this.engine3D.objects = [];
        if(this.engine3D.renderer) this.engine3D.renderer.dispose();
    },

    handleKey3D(code, isDown) {
        switch (code) {
            case 'ArrowUp':
            case 'KeyW':
                this.engine3D.keys.forward = isDown;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.engine3D.keys.left = isDown;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.engine3D.keys.backward = isDown;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.engine3D.keys.right = isDown;
                break;
        }
    },

    build3DRoom() {
        const scene = this.engine3D.scene;
        
        // Floor (Hardwood)
        const floorGeo = new THREE.PlaneGeometry(40, 40, 10, 10);
        floorGeo.rotateX(-Math.PI / 2);
        const floorMat = new THREE.MeshStandardMaterial({ 
            color: 0x4a3018, 
            roughness: 0.7 
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.receiveShadow = true;
        scene.add(floor);
        this.engine3D.objects.push(floor);

        // Cozy Carpet / Rug in the center
        const rugGeo = new THREE.PlaneGeometry(16, 16);
        rugGeo.rotateX(-Math.PI / 2);
        const rugMat = new THREE.MeshStandardMaterial({ color: 0x8b2500, roughness: 1.0 }); // Deep red
        const rug = new THREE.Mesh(rugGeo, rugMat);
        rug.position.y = 0.05; // Slightly above floor
        rug.receiveShadow = true;
        scene.add(rug);

        // Walls (Warm wallpaper)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xeeddcc, roughness: 0.9 });
        const wallGeo = new THREE.PlaneGeometry(40, 12);
        
        const walls = [
            { pos: [0, 6, -20], rot: [0, 0, 0] },     // North
            { pos: [0, 6, 20], rot: [0, Math.PI, 0] }, // South
            { pos: [-20, 6, 0], rot: [0, Math.PI/2, 0] }, // West
            { pos: [20, 6, 0], rot: [0, -Math.PI/2, 0] }  // East
        ];

        walls.forEach(w => {
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(...w.pos);
            wall.rotation.set(...w.rot);
            wall.receiveShadow = true;
            scene.add(wall);
            this.engine3D.objects.push(wall);
        });

        // --- Add Cozy Furniture ---
        
        // 1. A Study Desk
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.8 });
        const deskGroup = new THREE.Group();
        
        // Desk Top
        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 3), woodMat);
        deskTop.position.set(0, 2.8, 0);
        deskTop.castShadow = true;
        deskGroup.add(deskTop);
        
        // Desk Legs
        const legGeo = new THREE.BoxGeometry(0.2, 2.8, 0.2);
        const legsData = [
            [-2.8, 1.4, -1.3], [2.8, 1.4, -1.3],
            [-2.8, 1.4, 1.3], [2.8, 1.4, 1.3]
        ];
        legsData.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(...pos);
            leg.castShadow = true;
            deskGroup.add(leg);
        });

        // Desk Lamp (Simple shape)
        const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16), new THREE.MeshStandardMaterial({color: 0x222222}));
        lampBase.position.set(-2, 2.95, -0.5);
        deskGroup.add(lampBase);
        const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), new THREE.MeshStandardMaterial({color: 0x888888}));
        lampStem.position.set(-2, 3.4, -0.5);
        lampStem.rotation.x = Math.PI / 8;
        deskGroup.add(lampStem);
        const lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 16), new THREE.MeshStandardMaterial({color: 0xdddddd}));
        lampHead.position.set(-2, 3.8, -0.3);
        lampHead.rotation.x = -Math.PI / 4;
        deskGroup.add(lampHead);

        deskGroup.position.set(-8, 0, -15); // Place it near the North-West wall
        deskGroup.rotation.y = Math.PI / 8; // Slight angle
        scene.add(deskGroup);

        // 2. House Plants
        this.createPottedPlant(-15, -15);
        this.createPottedPlant(15, -15);
        this.createPottedPlant(15, 15);
        this.createPottedPlant(-15, 15);
    },

    createPottedPlant(x, z) {
        const scene = this.engine3D.scene;
        const potMat = new THREE.MeshStandardMaterial({ color: 0xbc4a3c, roughness: 0.9 }); // Terracotta
        const plantMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.6 }); // Sea green

        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.5, 1.5, 16), potMat);
        pot.position.set(x, 0.75, z);
        pot.castShadow = true;
        scene.add(pot);

        // 3 Leaves (low poly style)
        const leafGeo = new THREE.SphereGeometry(0.6, 5, 5); // Diamond/low poly look
        [[-0.3, 2.0, 0], [0.3, 1.8, 0.3], [0, 2.2, -0.3]].forEach((pos, i) => {
            const leaf = new THREE.Mesh(leafGeo, plantMat);
            leaf.position.set(x + pos[0], pos[1], z + pos[2]);
            leaf.rotation.set(Math.random(), Math.random(), Math.random());
            leaf.castShadow = true;
            scene.add(leaf);
        });
    },

    createTextLabel(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#1a1a1a'; // Dark background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#c69c6d'; // Gold border
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, canvas.width-10, canvas.height-10);

        ctx.fillStyle = '#ffffff'; // White text
        ctx.font = 'bold 60px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const geometry = new THREE.PlaneGeometry(3, 0.75);
        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    },

    renderBooksGrid() {
        // Intercept native 2D grid rendering to trigger 3D rebuild
        // UI overlay updates handled in init3DLibrary.
        if (this.engine3D.active) {
            this.render3DBookshelves();
        }
    },
    render3DBookshelves() {
        if(!this.engine3D.scene) return;
        const scene = this.engine3D.scene;

        // Cleanup existing racks/books before rebuilding
        this.engine3D.racks.forEach(r => scene.remove(r.group));
        this.engine3D.interactiveBooks = [];
        this.engine3D.racks = [];

        // 1. Tag Aggregation (Find top 6 tags)
        let tagCounts = {};
        this.books.forEach(b => {
            if(b.tags && b.tags.length > 0) {
                b.tags.forEach(t => {
                    const tag = t.trim().toUpperCase();
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            } else {
                tagCounts['UNCATEGORIZED'] = (tagCounts['UNCATEGORIZED'] || 0) + 1;
            }
        });

        const sortedTags = Object.keys(tagCounts).sort((a,b) => tagCounts[b] - tagCounts[a]).slice(0, 6);
        if(sortedTags.length === 0) sortedTags.push("EMPTY LIBRARY");

        // 2. Define Rack Positions (Circle around center)
        const radius = 12;
        const rackPositions = [];
        for(let i = 0; i < sortedTags.length; i++) {
            const angle = (i / sortedTags.length) * Math.PI * 2;
            rackPositions.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                rotY: -angle + Math.PI / 2, // Face the origin (0,0)
                tag: sortedTags[i]
            });
        }

        // 3. Materials
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
        
        // 4. Build Racks
        rackPositions.forEach(rp => {
            const rackGroup = new THREE.Group();
            rackGroup.position.set(rp.x, 0, rp.z);
            rackGroup.rotation.y = rp.rotY;

            // Simple 3D Bookshelf Mesh
            const backBoard = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2), woodMat);
            backBoard.position.set(0, 1.5, -0.4);
            rackGroup.add(backBoard);

            // Create 3 Shelves per rack (y = 0.5, 1.5, 2.5)
            const shelfLevels = [0.1, 1.1, 2.1];
            shelfLevels.forEach(y => {
                const shelf = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 1), woodMat);
                shelf.position.set(0, y, 0);
                shelf.receiveShadow = true;
                shelf.castShadow = true;
                rackGroup.add(shelf);
            });
            
            // Side boards
            const sideLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 1), woodMat);
            sideLeft.position.set(-2, 1.5, 0);
            rackGroup.add(sideLeft);
            
            const sideRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 1), woodMat);
            sideRight.position.set(2, 1.5, 0);
            rackGroup.add(sideRight);

            // Add Tag Label on top!
            const labelMesh = this.createTextLabel(rp.tag);
            labelMesh.position.set(0, 3.5, 0); // Above the backboard
            rackGroup.add(labelMesh);

            scene.add(rackGroup);
            this.engine3D.racks.push({ group: rackGroup, tag: rp.tag, currentShelf: 0, currentX: -1.7 });
        });

        // 5. Place Books!
        this.books.forEach(b => {
             // Find matching rack
             let targetRack = this.engine3D.racks.find(r => b.tags && b.tags.some(t => t.trim().toUpperCase() === r.tag));
             if(!targetRack) targetRack = this.engine3D.racks.find(r => r.tag === 'UNCATEGORIZED') || this.engine3D.racks[0];

             // Check if shelf is full
             if (targetRack.currentX > 1.7) {
                 targetRack.currentX = -1.7;
                 targetRack.currentShelf++;
             }

             // If rack totally full, skip rendering (or dump on floor, but let's skip for simplicity)
             if (targetRack.currentShelf > 2) return;

             // Create Book Mesh
             const bookColor = this.getBookColor(b.title);
             const bookMat = new THREE.MeshStandardMaterial({ color: bookColor, roughness: 0.4 });
             // Thickness: 0.1 to 0.3 based on ID, Height: 0.6 to 0.8
             const thickness = 0.1 + ((b.id * 17) % 20) / 100;
             const height = 0.6 + ((b.id * 13) % 20) / 100;
             const bookGeo = new THREE.BoxGeometry(thickness, height, 0.6);
             const bookMesh = new THREE.Mesh(bookGeo, bookMat);

             // Y = shelf level + half height of book
             const shelfYPositions = [0.1, 1.1, 2.1]; // from shelf building
             const yPos = shelfYPositions[targetRack.currentShelf] + (height / 2) + 0.05;
             
             bookMesh.position.set(targetRack.currentX, yPos, 0);
             bookMesh.castShadow = true;

             // Slightly randomize rotation to look natural
             bookMesh.rotation.y = (Math.random() - 0.5) * 0.1;
             
             targetRack.group.add(bookMesh);
             
             // Register for interaction
             this.engine3D.interactiveBooks.push({ mesh: bookMesh, bookData: b });

             // Advance X position for next book
             targetRack.currentX += (thickness + 0.05); 
        });
    },

    handleInteractionClick() {
        if (!this.engine3D.controls || !this.engine3D.controls.isLocked) return;

        // Raycast from center camera
        this.engine3D.raycaster.setFromCamera(this.engine3D.mouse, this.engine3D.camera);
        
        // Collect all interactive book meshes
        const interactiveMeshes = this.engine3D.interactiveBooks.map(b => b.mesh);
        
        const intersects = this.engine3D.raycaster.intersectObjects(interactiveMeshes);

        if (intersects.length > 0) {
            const hitMesh = intersects[0].object;
            const bookRecord = this.engine3D.interactiveBooks.find(b => b.mesh === hitMesh);
            
            if (bookRecord) {
                 // Trigger Navigation
                 this.engine3D.controls.unlock();
                 this.navigate('reader', bookRecord.bookData.id);
            }
        }
    },

    animate3D() {
        if (!this.engine3D.active) return;
        this.engine3D.rafId = requestAnimationFrame(() => this.animate3D());

        const e = this.engine3D;
        const time = performance.now();
        
        // FPS Movement Physics
        if (e.controls && e.controls.isLocked) {
            const delta = (time - e.prevTime) / 1000;
            
            e.velocity.x -= e.velocity.x * 10.0 * delta;
            e.velocity.z -= e.velocity.z * 10.0 * delta;
            
            e.direction.z = Number(e.keys.forward) - Number(e.keys.backward);
            e.direction.x = Number(e.keys.right) - Number(e.keys.left);
            e.direction.normalize(); // consistent speed in all directions
            
            const speed = 40.0;
            if (e.keys.forward || e.keys.backward) e.velocity.z -= e.direction.z * speed * delta;
            if (e.keys.left || e.keys.right) e.velocity.x -= e.direction.x * speed * delta;
            
            e.controls.moveRight(-e.velocity.x * delta);
            e.controls.moveForward(-e.velocity.z * delta);
            
            // Constrain to room (floor is 40x40, so bounds are -18 to 18 to account for camera collision)
            const pos = e.controls.getObject().position;
            if (pos.x < -18) pos.x = -18;
            if (pos.x > 18) pos.x = 18;
            if (pos.z < -18) pos.z = -18;
            if (pos.z > 18) pos.z = 18;
            pos.y = 1.6; // Keep locked on the floor

            // Interactive Hover (Crosshair Tooltip)
            e.raycaster.setFromCamera(e.mouse, e.camera);
            const interactiveMeshes = e.interactiveBooks.map(b => b.mesh);
            const intersects = e.raycaster.intersectObjects(interactiveMeshes);
            const tooltip = document.getElementById('book-tooltip');

            if (intersects.length > 0 && intersects[0].distance < 6) { // Must be close
                const hitMesh = intersects[0].object;
                const bookRecord = e.interactiveBooks.find(b => b.mesh === hitMesh);
                if (bookRecord && tooltip) {
                    tooltip.classList.remove('d-none');
                    document.getElementById('tooltip-title').innerText = bookRecord.bookData.title;
                    // Optional: Make hovered book pop out slightly
                    hitMesh.position.z = Math.min(hitMesh.position.z + 0.05, 0.2); 
                }
            } else {
                if(tooltip) tooltip.classList.add('d-none');
                // Push back books slowly
                interactiveMeshes.forEach(m => {
                    if (m.position.z > 0) m.position.z = Math.max(0, m.position.z - 0.02);
                });
            }
        }
        
        e.prevTime = time;
        e.renderer.render(e.scene, e.camera);
    },

    openNewBookModal() {
        const modal = new bootstrap.Modal(document.getElementById('newBookModal'));
        modal.show();
    },

    async submitNewBook() {
        const title = document.getElementById('bookTitle').value.trim();
        const tagsStr = document.getElementById('bookTags').value;
        const prompt = document.getElementById('bookPrompt').value.trim();
        const fileInput = document.getElementById('bookPdf');
        
        if (!title) return alert("Title is required");
        
        const type = fileInput.files.length > 0 ? 'PDF' : 'Image';
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
        
        // Disable button
        const btn = document.querySelector('#newBookModal .btn-primary');
        const originalText = btn.innerText;
        btn.innerText = "Creating...";
        btn.disabled = true;
        
        try {
            const book = await api.createBook(title, type, tags, prompt);
            
            if (fileInput.files.length > 0) {
                btn.innerText = "Uploading PDF...";
                await api.uploadPdf(book.id, fileInput.files[0]);
            }
            
            // Close modal and navigate
            bootstrap.Modal.getInstance(document.getElementById('newBookModal')).hide();
            this.navigate('reader', book.id);
            
            if (fileInput.files.length > 0) {
                // If PDF was uploaded, show processing banner immediately in the new reader view
                const banner = document.getElementById('upload-progress-banner');
                if (banner) banner.classList.remove('d-none');
                const pBar = document.getElementById('upload-progress-bar');
                if (pBar) pBar.style.width = '2%';
                const pText = document.getElementById('progress-text');
                if (pText) pText.innerText = 'Starting...';
            }
            
            document.getElementById('newBookForm').reset();
            
        } catch (e) {
            alert("Error creating book: " + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    async loadBookDetails(id) {
        document.getElementById('reader-book-title').innerText = "Loading...";
        document.getElementById('reader-chapters').innerHTML = '<div class="p-3 text-center"><div class="spinner-border spinner-border-sm"></div></div>';
        
        try {
            this.currentBook = await api.getBook(id);
            document.getElementById('reader-book-title').innerHTML = `
                ${this.currentBook.title}
                <button class="btn btn-sm btn-outline-secondary ms-2 rounded-pill" onclick="app.openEditBookModal()">
                    <i class="bi bi-pencil"></i> Edit
                </button>
                <button class="btn btn-sm btn-outline-danger ms-1 rounded-pill" onclick="app.deleteBook()">
                    <i class="bi bi-trash"></i> Delete Book
                </button>
            `;
            
            const list = document.getElementById('reader-chapters');
            list.innerHTML = '';
            
            if (this.currentBook.segments.length === 0) {
                 list.innerHTML = '<div class="p-3 text-muted small">No segments yet. Upload a PDF or add images.</div>';
                 return;
            }
            
            this.currentBook.segments.forEach((s, idx) => {
                const btn = document.createElement('button');
                btn.className = 'list-group-item list-group-item-action';
                btn.innerHTML = `<strong>Seq ${s.index}</strong>: ${s.title || 'Untitled Segment'}`;
                btn.onclick = () => this.showSegmentSummary(s);
                list.appendChild(btn);
            });
            
            // Show first by default
            if(this.currentBook.segments.length > 0) {
                this.showSegmentSummary(this.currentBook.segments[0]);
            }
            
            // Auto-refresh segments while in Reader view
            if(this.pollingInterval) clearInterval(this.pollingInterval);
            this.pollingInterval = setInterval(async () => {
                if (this.currentView !== 'reader' || !this.currentBook) {
                    clearInterval(this.pollingInterval);
                    return;
                }
                try {
                    const refreshedBook = await api.getBook(id);
                    const banner = document.getElementById('upload-progress-banner');
                    const pBar = document.getElementById('upload-progress-bar');
                    const pText = document.getElementById('progress-text');

                    if (refreshedBook.processing_status === 'processing') {
                        banner.classList.remove('d-none');
                        if (refreshedBook.total_pages) {
                            const percent = Math.round((refreshedBook.processed_pages / refreshedBook.total_pages) * 100);
                            pBar.style.width = `${percent}%`;
                            pText.innerText = `${refreshedBook.processed_pages} / ${refreshedBook.total_pages} pages`;
                        } else {
                            pText.innerText = 'Processing...';
                        }
                    } else if (refreshedBook.processing_status === 'completed') {
                        banner.classList.add('d-none');
                    } else if (refreshedBook.processing_status === 'failed') {
                        banner.classList.remove('d-none');
                        banner.className = 'alert alert-danger mb-3 border-0 d-flex flex-column shadow-sm';
                        pText.innerText = 'Processing Failed';
                        pBar.classList.remove('progress-bar-animated');
                        pBar.classList.add('bg-danger');
                    } else if (refreshedBook.processing_status === 'cancelled') {
                        banner.classList.remove('d-none');
                        banner.className = 'alert alert-warning mb-3 border-0 d-flex flex-column shadow-sm';
                        pText.innerText = 'Processing Cancelled';
                        pBar.classList.remove('progress-bar-animated');
                        pBar.classList.add('bg-warning');
                    }

                    // If we have new segments processed by Celery, refresh the whole UI!
                    if (refreshedBook.segments.length > this.currentBook.segments.length) {
                        this.currentBook = refreshedBook;
                        this.renderReaderSegments();
                    }
                    
                    if (['completed', 'failed', 'cancelled'].includes(refreshedBook.processing_status)) {
                        clearInterval(this.pollingInterval);
                    }
                } catch(e) {}
            }, 3000);
        } catch (e) {
             document.getElementById('reader-book-title').innerText = "Error loading book";
             console.error(e);
        }
    },

    renderReaderSegments() {
        if (!this.currentBook) return;
        const list = document.getElementById('reader-chapters');
        list.innerHTML = '';
        this.currentBook.segments.forEach((s, idx) => {
            const btn = document.createElement('button');
            btn.className = 'list-group-item list-group-item-action';
            btn.innerHTML = `<strong>Seq ${s.index}</strong>: ${s.title || 'Untitled Segment'}`;
            btn.onclick = () => this.showSegmentSummary(s);
            list.appendChild(btn);
        });
        // Select last added if not viewing any
        const activeItem = list.querySelector('.active');
        if (!activeItem && this.currentBook.segments.length > 0) {
            this.showSegmentSummary(this.currentBook.segments[0]);
        }
    },

    async cancelCurrentTask() {
        if (!this.currentBook || !this.currentBook.id) return;
        if (!confirm("Are you sure you want to stop processing this book?")) return;
        try {
            await api.cancelTask(this.currentBook.id);
            // Status will be updated by polling next cycle
        } catch (e) {
            alert("Error cancelling task: " + e.message);
        }
    },
    
    showSegmentSummary(segment) {
        document.getElementById('reader-summary-title').innerHTML = `
            ${segment.title || `Segment ${segment.index}`}
            <button class="btn btn-sm btn-outline-danger ms-2" onclick="app.deleteSegment(${segment.id})">
                <i class="bi bi-trash"></i> Delete
            </button>
        `;
        let content = segment.summary ? marked.parse(segment.summary) : '<em class="text-muted">Summary is empty or pending processing...</em>';
        
        if (segment.source_assets && segment.source_assets.length > 0) {
            content += `<h6 class="mt-4 mb-2 fw-bold text-secondary text-uppercase small"><i class="bi bi-paperclip me-2"></i>Source Assets</h6><div class="d-flex gap-2 flex-wrap mb-4">`;
            segment.source_assets.forEach(asset => {
                if(asset.match(/\.(jpeg|jpg|png|webp)$/i)) {
                    content += `<a href="/uploads/${asset}" target="_blank" class="border rounded d-inline-block overflow-hidden shadow-sm bg-black"><img src="/uploads/${asset}" style="height: 100px; width: 100px; object-fit: cover;"></a>`;
                } else {
                    content += `<a href="/uploads/${asset}" target="_blank" class="btn btn-outline-secondary btn-sm shadow-sm"><i class="bi bi-file-pdf-fill text-danger"></i> View Original PDF</a>`;
                }
            });
            content += `</div>`;
        }
        
        if (segment.extracted_text) {
            const raw = segment.extracted_text.replace(/\\n/g, '<br>');
            content += `
                <hr class="my-4 text-muted">
                <details class="text-muted border p-3 rounded bg-body-tertiary">
                    <summary class="fw-semibold user-select-none" style="cursor:pointer;"><i class="bi bi-file-earmark-text me-2"></i>View Raw Uploaded Text</summary>
                    <div class="mt-3 small" style="max-height: 300px; overflow-y: auto;">
                        ${raw}
                    </div>
                </details>
            `;
        }
        
        document.getElementById('reader-summary-content').innerHTML = content;
    },

    async deleteBook() {
        if (!this.currentBook) return;
        if (!confirm(`Are you sure you want to delete "${this.currentBook.title}"?`)) return;
        if (!confirm(`FINAL WARNING: This will permanently wipe all uploaded images, PDFs, extracted text, and AI summaries for this book.\n\nPress OK to permanently wipe data.`)) return;
        
        try {
            await api.deleteBook(this.currentBook.id);
            this.navigate('dashboard');
        } catch(e) {
            alert("Error deleting book: " + e.message);
        }
    },

    async deleteSegment(segmentId) {
        if(!confirm("Are you sure you want to delete this segment? You can rescan the image afterwards.")) return;
        try {
            await api.deleteSegment(this.currentBook.id, segmentId);
            this.loadBookDetails(this.currentBook.id);
        } catch(e) {
            alert("Error deleting segment: " + e.message);
        }
    },
    
    openEditBookModal() {
        if (!this.currentBook) return;
        document.getElementById('editBookTags').value = (this.currentBook.tags || []).join(', ');
        document.getElementById('editBookPrompt').value = this.currentBook.custom_prompt || '';
        new bootstrap.Modal(document.getElementById('editBookModal')).show();
    },

    async submitEditBook() {
        const tagsStr = document.getElementById('editBookTags').value;
        const prompt = document.getElementById('editBookPrompt').value.trim();
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
        
        const btn = document.querySelector('#editBookForm button[type="button"]');
        const originalText = btn.innerText;
        btn.innerText = "Saving...";
        btn.disabled = true;
        
        try {
            await api.updateBookMetadata(this.currentBook.id, tags, prompt);
            bootstrap.Modal.getInstance(document.getElementById('editBookModal')).hide();
            this.loadBookDetails(this.currentBook.id);
        } catch(e) {
            alert("Error updating: " + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if(!text) return;
        
        this.addChatBubble(text, 'user');
        input.value = '';
        
        // Target specific book if in reader mode, else global
        const targetBookId = this.currentBook ? this.currentBook.id : null; 
        
        // Form the context string for smooth UI experience
        const bgBookTitle = this.currentBook ? this.currentBook.title : "Global Library";
        document.getElementById('chat-input').placeholder = `Asking Po about ${bgBookTitle}...`;
        
        // ChatGPT style pulsing typing indicator
        const typingId = this.addChatBubble(
            '<div class="spinner-grow spinner-grow-sm text-primary" role="status"></div><div class="spinner-grow spinner-grow-sm text-primary mx-1" role="status" style="animation-delay: 0.2s"></div><div class="spinner-grow spinner-grow-sm text-primary" role="status" style="animation-delay: 0.4s"></div>', 
            'ai', 
            true
        );
        
        try {
            const res = await api.askChat(text, targetBookId, this.currentSessionId);
            this.currentSessionId = res.session_id; // Map pointer dynamically forward
            
            document.getElementById(typingId).remove();
            this.addChatBubble(res.answer || 'Sorry, I couldn\'t process that.', 'ai');
        } catch(e) {
            document.getElementById(typingId).remove();
            this.addChatBubble('Error: ' + e.message, 'ai');
        } finally {
            document.getElementById('chat-input').placeholder = "Message Po...";
        }
    },
    
    handleChatEnter(e) {
        if(e.key === 'Enter') this.sendChatMessage();
    },
    
    addChatBubble(text, sender, isHtml = false) {
        const container = document.getElementById('chat-messages');
        const id = 'msg-' + Date.now();
        const wrapper = document.createElement('div');
        
        // Align user to right, AI to left
        wrapper.className = `d-flex align-items-start mb-2 ${sender === 'user' ? 'justify-content-end' : ''}`;
        
        const bubble = document.createElement('div');
        bubble.id = id;
        
        if (sender === 'user') {
            bubble.className = 'bg-primary text-white p-3 rounded-4 shadow-sm';
            bubble.style.borderBottomRightRadius = '4px';
            bubble.style.maxWidth = '85%';
        } else {
            bubble.className = 'bg-body-secondary p-3 rounded-4 shadow-sm text-break';
            bubble.style.borderBottomLeftRadius = '4px';
            bubble.style.maxWidth = '85%';
        }
        bubble.style.fontSize = '1.05rem';
        
        if (sender === 'ai' && !isHtml) {
            bubble.innerHTML = `<i class="bi bi-robot text-primary me-2 mb-2 d-block"></i> ` + marked.parse(text);
        } else if (isHtml) {
            bubble.innerHTML = text; // For the nice loading indicator
        } else {
            bubble.textContent = text;
        }
        
        wrapper.appendChild(bubble);
        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;
        return id;
    },
    
    escapeHtml(unsafe) {
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/\\n/g, '<br>');
    },
    
    async performSearch() {
        const query = document.getElementById('search-input').value;
        if(!query) return;
        
        const resultsContainer = document.getElementById('search-results');
        resultsContainer.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Searching...';
        
        try {
            const res = await api.search(query);
            resultsContainer.innerHTML = '';
            
            if(res.results.length === 0) {
                 resultsContainer.innerHTML = '<div class="alert alert-info">No confident matches found.</div>';
                 return;
            }
            
            res.results.forEach(r => {
                const card = document.createElement('div');
                card.className = 'card bg-body-tertiary shadow-sm';
                card.innerHTML = `
                    <div class="card-body">
                        <h6 class="card-subtitle mb-2 text-primary">Book ID: ${r.book_id} <span class="badge bg-secondary float-end">Score: ${(r.vector_score).toFixed(2)}</span></h6>
                        <p class="card-text small">${r.text_content.substring(0, 200)}...</p>
                        <button class="btn btn-sm btn-outline-primary" onclick="app.navigate('reader', ${r.book_id})">Open Book</button>
                    </div>
                `;
                resultsContainer.appendChild(card);
            });
        } catch(e) {
            resultsContainer.innerHTML = `<div class="alert alert-danger">Error: ${e.message}</div>`;
        }
    },
    
    currentSessionId: null,

    async openChat() {
        this.navigate('chat');
        this.currentSessionId = null;
        const msgContainer = document.getElementById('chat-messages');
        msgContainer.innerHTML = '';
        
        const bookId = this.currentBook ? this.currentBook.id : 'global';
        const titleText = this.currentBook ? this.currentBook.title : 'Global Library';
        
        document.getElementById('chat-header-title').innerText = `Chat: ${titleText}`;
        document.getElementById('chat-input').placeholder = `Message Po about ${titleText}...`;

        try {
            // Fetch highest-level recent session globally or per book
            const sessions = await api.getSessions(bookId);
            if (sessions && sessions.length > 0) {
                await this.loadSpecificSession(sessions[0].id);
            } else {
                this.startNewChatSession();
            }
        } catch(e) {
            this.addChatBubble("Error loading past sessions.", "ai");
        }
    },

    async openChatHistorySidebar() {
        const bookId = this.currentBook ? this.currentBook.id : 'global';
        const listEl = document.getElementById('chat-history-list');
        listEl.innerHTML = '<div class="p-4 text-center"><div class="spinner-border spinner-border-sm mb-2"></div></div>';
        
        const offcanvasEl = document.getElementById('chatHistoryOffcanvas');
        const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl) || new bootstrap.Offcanvas(offcanvasEl);
        bsOffcanvas.show();

        try {
            const sessions = await api.getSessions(bookId);
            if (sessions.length === 0) {
                listEl.innerHTML = '<div class="p-4 text-center text-muted">No past sessions found.</div>';
                return;
            }
            
            listEl.innerHTML = sessions.map(s => `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-start ${this.currentSessionId === s.id ? 'active' : ''}">
                    <div class="ms-2 me-auto" style="cursor: pointer; width:85%;" onclick="app.loadSpecificSession(${s.id})">
                        <div class="fw-bold text-truncate">${s.summary ? s.summary.substring(0,40)+'...' : 'General Chat Session'}</div>
                        <small class="${this.currentSessionId === s.id ? 'text-light' : 'text-muted'}">${new Date(s.created_at).toLocaleString()}</small>
                    </div>
                    <button class="btn btn-sm btn-link text-danger p-0 align-self-center shadow-none" onclick="app.deleteChatSession(${s.id}, event)">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `).join('');
        } catch (e) {
            listEl.innerHTML = '<div class="p-4 text-danger text-center">Failed to load history.</div>';
        }
    },

    async loadSpecificSession(sessionId) {
        const bookId = this.currentBook ? this.currentBook.id : 'global';
        const sessions = await api.getSessions(bookId);
        const starget = sessions.find(s => s.id === sessionId);
        if (!starget) return;
        
        this.currentSessionId = starget.id;
        document.getElementById('chat-messages').innerHTML = '';
        
        if (starget.summary) {
            this.addChatBubble(`<i class="bi bi-archive text-secondary me-2"></i> <em class="small text-muted">Archived Context: ${starget.summary.substring(0, 100)}...</em>`, 'ai', true);
        }
        
        if (starget.messages && starget.messages.length > 0) {
            starget.messages.forEach(msg => {
                this.addChatBubble(msg.content, msg.role === 'user' ? 'user' : 'ai');
            });
        } else {
            this.startNewChatSession(true); // Populate welcome text if empty
        }
        
        const offcanvasEl = document.getElementById('chatHistoryOffcanvas');
        const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
        if (bsOffcanvas) bsOffcanvas.hide();
    },

    async deleteChatSession(sessionId, event) {
        if(event) event.stopPropagation();
        if(confirm('Are you sure you want to permanently delete this chat thread?')) {
            await api.deleteSession(sessionId);
            if (this.currentSessionId === sessionId) {
                this.startNewChatSession();
                const obj = bootstrap.Offcanvas.getInstance(document.getElementById('chatHistoryOffcanvas'));
                if (obj) obj.hide();
            } else {
                this.openChatHistorySidebar();
            }
        }
    },

    startNewChatSession(skipReset = false) {
        this.currentSessionId = null;
        document.getElementById('chat-messages').innerHTML = '';
        const title = this.currentBook ? this.currentBook.title : 'Global Library';
        this.addChatBubble(`<i class="bi bi-stars text-primary me-2"></i> Started a fresh session! Ask me anything about <b>${title}</b>.`, 'ai', true);
        
        if (!skipReset) {
            const obj = bootstrap.Offcanvas.getInstance(document.getElementById('chatHistoryOffcanvas'));
            if (obj) obj.hide();
        }
    },

    openQuizModal() {
        document.getElementById('quiz-content').innerHTML = `
            <form id="quizForm">
                <div class="mb-3"><label class="form-label">Difficulty</label><select class="form-select" id="quizDifficulty"><option>Easy</option><option selected>Mixed</option><option>Hard</option></select></div>
                <div class="mb-3"><label class="form-label">Questions</label><input type="number" class="form-control" id="quizQuestions" value="5" min="1" max="20"></div>
            </form>
        `;
        const btn = document.querySelector('#quizModal .btn-primary');
        if (btn) {
            btn.classList.remove('d-none');
            btn.innerText = "Generate";
            btn.disabled = false;
        }
        new bootstrap.Modal(document.getElementById('quizModal')).show();
    },

    async generateAndShowQuiz() {
        const diff = document.getElementById('quizDifficulty').value;
        const num = document.getElementById('quizQuestions').value;
        const btn = document.querySelector('#quizModal .btn-primary');
        const content = document.getElementById('quiz-content');
        
        btn.disabled = true;
        btn.innerText = "Generating...";
        
        try {
            const res = await api.generateQuiz(this.currentBook.id, num, diff);
            if(res.questions) {
                let html = '<div class="quiz-container">';
                res.questions.forEach((q, i) => {
                    html += `<div class="card mb-3 border-0 shadow-sm bg-body-tertiary">
                                <div class="card-body">
                                    <h6 class="card-title text-primary fw-bold">Q${i+1}</h6>
                                    <p class="card-text">${q.question}</p>`;
                    
                    if(q.options && q.options.length > 0) {
                        html += `<ul class="list-group list-group-flush mb-3 border rounded shadow-sm">`;
                        q.options.forEach(opt => html += `<li class="list-group-item bg-transparent">${opt}</li>`);
                        html += `</ul>`;
                    } else {
                        html += `<p class="text-muted fst-italic mb-3">(Open Answer)</p>`;
                    }
                    
                    if (q.answer) {
                        html += `<details class="mt-2 text-success" style="cursor: pointer;">
                                    <summary class="fw-semibold user-select-none"><i class="bi bi-eye"></i> Show Answer</summary>
                                    <div class="p-2 bg-success text-white mt-2 rounded shadow-sm small">${q.answer}</div>
                                 </details>`;
                    }
                    
                    html += `</div></div>`;
                });
                html += '</div>';
                content.innerHTML = html;
                btn.classList.add("d-none"); // Hide Generate button so we only have one Close button
            }
        } catch(e) {
            content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
            btn.innerText = "Error";
        } finally {
            btn.disabled = false;
        }
    },
    
    async loadQuizzes() {
        const grid = document.getElementById('quizzes-grid');
        grid.innerHTML = '<div class="text-center text-muted py-5"><div class="spinner-border"></div></div>';
        try {
            const list = await api.getQuizzes();
            grid.innerHTML = '';
            if (list.length === 0) {
                grid.innerHTML = `<div class="text-center text-muted py-5"><i class="bi bi-patch-question fs-1 d-block mb-3 opacity-50"></i><p>You haven't generated any quizzes yet.</p></div>`;
                return;
            }
            
            list.forEach(q => {
                const scoreText = q.score !== null ? `<span class="badge bg-${q.score >= 80 ? 'success' : (q.score >= 50 ? 'warning' : 'danger')} float-end">Score: ${q.score}%</span>` : '<span class="badge bg-secondary float-end">Not Scored</span>';
                const col = document.createElement('div');
                col.className = 'col-12 col-md-4 col-lg-3';
                col.innerHTML = `
                    <div class="card h-100 shadow-sm border-0 border-top border-4 border-${q.score >= 80 ? 'success' : (q.score >= 50 ? 'warning' : 'danger')} rounded-top" style="cursor: pointer" onclick="app.openHistoricalQuiz(${q.id})">
                        <div class="card-body">
                            ${scoreText}
                            <h6 class="card-subtitle mb-2 text-primary fw-bold text-truncate">${q.book_title}</h6>
                            <p class="card-text mb-1"><i class="bi bi-list-ol text-muted me-2"></i> ${q.total_questions} Questions</p>
                            <p class="card-text small text-muted"><i class="bi bi-bar-chart-fill me-2"></i> ${q.difficulty} Difficulty</p>
                        </div>
                        <div class="card-footer bg-transparent border-0 text-muted small data-bs-theme='dark'">
                            ${new Date(q.created_at).toLocaleDateString()}
                        </div>
                    </div>
                `;
                grid.appendChild(col);
            });
        } catch(e) {
            grid.innerHTML = `<div class="alert alert-danger">Error fetching quizzes.</div>`;
        }
    },

    async openHistoricalQuiz(quizId) {
        document.getElementById('quiz-content').innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div></div>';
        const btn = document.querySelector('#quizModal .btn-primary');
        if (btn) btn.classList.add('d-none');
        
        const modalEl = document.getElementById('quizModal');
        const bsModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        bsModal.show();
        
        try {
            const qTarget = await api.getQuizDetails(quizId);
            const content = document.getElementById('quiz-content');
            
            const quizList = Array.isArray(qTarget.quized_data) ? qTarget.quized_data : qTarget.quized_data?.quiz || [];
            const userAnswers = qTarget.quized_data?.user_answers || [];
            
            let html = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-primary text-uppercase">${qTarget.difficulty} Difficulty</span>
                    <span class="fw-bold text-${qTarget.score >= 80 ? 'success' : 'warning'} fs-5">Score: ${qTarget.score !== null ? qTarget.score + '%' : 'N/A'}</span>
                </div>
                <div class="quiz-container">
            `;
            
            quizList.forEach((q, i) => {
                html += `<div class="card mb-3 border-0 shadow-sm bg-body-tertiary">
                            <div class="card-body">
                                <h6 class="card-title text-primary fw-bold mb-3 border-bottom pb-2">Question #${i+1}</h6>
                                <p class="card-text mb-4 lead" style="font-size: 1.1rem">${q.question}</p>`;
                
                const userAnswerObj = userAnswers[i];
                const userAnswer = userAnswerObj ? userAnswerObj.answer : null;
                
                if(q.options && q.options.length > 0) {
                    html += `<ul class="list-group list-group-flush mb-3 border rounded shadow-sm">`;
                    q.options.forEach(opt => {
                        let liClass = "bg-transparent";
                        let icon = "";
                        
                        // Strict check matching our backend logic
                        const optNorm = opt.toString().trim().toLowerCase();
                        const ansNorm = (q.answer || "").toString().trim().toLowerCase();
                        const usrNorm = (userAnswer || "").toString().trim().toLowerCase();

                        if (usrNorm === optNorm && usrNorm === ansNorm) {
                            liClass = "list-group-item-success fw-bold";
                            icon = `<i class="bi bi-check-circle-fill text-success me-2"></i>`;
                        } else if (usrNorm === optNorm && usrNorm !== ansNorm) {
                            liClass = "list-group-item-danger text-decoration-line-through text-muted";
                            icon = `<i class="bi bi-x-circle-fill text-danger me-2"></i>`;
                        } else if (optNorm === ansNorm) {
                            liClass = "list-group-item-success bg-opacity-25";
                            icon = `<i class="bi bi-lightbulb-fill text-success me-2"></i>`;
                        }
                        
                        html += `<li class="list-group-item ${liClass}">${icon}${opt}</li>`;
                    });
                    html += `</ul>`;
                } else {
                    html += `<p class="text-muted border rounded p-3 mb-3 bg-body">Your Answer: <em>${userAnswer || 'None Provided'}</em></p>`;
                }
                
                if (q.answer) {
                    html += `<details class="mt-2 text-success" style="cursor: pointer;">
                                <summary class="fw-semibold user-select-none"><i class="bi bi-eye"></i> Show Official Knowledge Source</summary>
                                <div class="p-3 bg-success text-white mt-2 rounded-4 shadow-sm small">${q.answer}</div>
                             </details>`;
                }
                
                html += `</div></div>`;
            });
            html += '</div>';
            content.innerHTML = html;
        } catch(e) {
            document.getElementById('quiz-content').innerHTML = `<div class="alert alert-danger">Error Loading Quiz History: ${e.message}</div>`;
        }
    },

    startCamera() {
        new bootstrap.Modal(document.getElementById('cameraModal')).show();
    },

    async uploadScannedImage() {
        const fileInput = document.getElementById('cameraInput');
        if(!fileInput.files.length) return alert('Take a photo first.');
        
        const btn = document.querySelector('#cameraModal .btn-primary');
        btn.disabled = true;
        btn.innerText = "Processing...";
        
        try {
            document.getElementById('upload-progress-banner').classList.remove('d-none');
            await api.uploadImages(this.currentBook.id, fileInput.files, 1);
            bootstrap.Modal.getInstance(document.getElementById('cameraModal')).hide();
        } catch(e) {
            alert("Error: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Upload & Process";
            fileInput.value = "";
        }
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
