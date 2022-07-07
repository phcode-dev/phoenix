<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Adjustable Fireworks</title>
    <style>
      html, body {
        height: 100%;
      }
      body {
        margin: 0;
        display: flex;
        overflow: hidden;
      }
      body, main {
        background-color: #000;
      }
      main {
        flex-grow: 1;
        overflow: hidden;
        position: relative;
        cursor: pointer;
      }
      .spark {
        border-radius: 50%;
        position: absolute;
        pointer-events: none;
        opacity: 1;
        transition: opacity var(--fadeDur) linear var(--fadeDelay), margin-top var(--time) cubic-bezier(0.5,0,1,1), -webkit-transform var(--time) cubic-bezier(0,1,1,1);
        transition: transform var(--time) cubic-bezier(0,1,1,1), opacity var(--fadeDur) linear var(--fadeDelay), margin-top var(--time) cubic-bezier(0.5,0,1,1);
        transition: transform var(--time) cubic-bezier(0,1,1,1), opacity var(--fadeDur) linear var(--fadeDelay), margin-top var(--time) cubic-bezier(0.5,0,1,1), -webkit-transform var(--time) cubic-bezier(0,1,1,1);
      }
      .spark.start {
        -webkit-transform: translate(var(--horizontal), var(--vertical));
                transform: translate(var(--horizontal), var(--vertical));
        opacity: 0;
        margin-top: var(--fall);
      }
      footer {
        padding: 0.6rem;
        border-radius: 0.6rem 0 0 0.6rem;
        background-color: #fff;
        overflow-y: auto;
        overflow-x: hidden;
      }
      #fullscreen, #share {
        margin-bottom: 0.2rem;
      }
      #reset {
        margin-top: 0.2rem;
      }
      input, label {
        cursor: pointer;
      }
      input.disabled {
        color: #aaa;
        border-color: rgba(118, 118, 118, 0.3);
      }
      input.disabled, input.disabled+label {
        cursor: default;
      }
      input.disabled+label {
        color: #aaa;
      }
      input[type=number]+label, select+label {
        float: left;
        margin-right: 0.2rem;
      }
      .indent {
        margin-left: 0.6rem;
      }
      input[type=number] {
        width: 8ch;
      }
      p, input[type=number] {
        margin: 0.1rem 0;
      }
      #title {
        margin: 0 0 0.2rem 0;
      }
      #byline p, #byline a {
        display: inline;
      }
      #byline {
        margin-bottom: 1rem;
      }
    </style>
  </head>
  <body>
    <main></main>
    <footer>
      <h3 id="title">Adjustable Fireworks</h3>
      <div id="byline">
        <p>By </p>
        <a href="https://tylergordonhill.com/" target="_blank">Tyler Gordon Hill</a>
      </div>
      <button id="fullscreen" title="Hide the settings panel. Press escape to exit">Fullscreen</button>
      <button id="share" title="Share the unique link to your settings configuration">Share</button>
      <form>
        <input type="checkbox" id="auto" name="auto" checked title="Automatically shoot off fireworks">
        <label for="auto" title="Automatically shoot off fireworks">Auto</label><br>
        <p title="Randomized delay between fireworks when Auto is on">Auto Delay</p>
        <input type="number" id="delayMin" name="delayMin" value="200" title="Minimum delay between fireworks when Auto is on">
        <label for="delayMin" class="indent" title="Minimum delay between fireworks when Auto is on">Min</label><br>
        <input type="number" id="delayMax" name="delayMax" value="1000" title="Maximum delay between fireworks when Auto is on">
        <label for="delayMax" class="indent" title="Maximum delay between fireworks when Auto is on">Max</label><br>
        <input type="checkbox" id="pause" name="pause" title="Pause exploding fireworks">
        <label for="pause" title="Pause exploding fireworks">Pause</label><br>
        <select id="randColor" name="randColor" title="Method of generating firework colors">
          <option value="spark" title="Each spark is a new random color">Spark</option>
          <option value="firework" selected title="Each firework is a new random color">Firework</option>
          <option value="chosen" title="Each spark is the same chosen color">Chosen</option>
        </select>
        <label for="randColor" title="Method of generating firework colors">Color Mode</label><br>
        <input type="color" id="color" name="color" value="#ff0000" class="disabled indent" title="Color to use for all fireworks if Color Mode is set to Chosen">
        <label for="color" title="Color to use for all fireworks if Color Mode is set to Chosen">Color</label><br>
        <input type="number" id="brightnessMin" name="brightnessMin" value="100" min="1" max="250" placeholder="0 to 255" title="Minimum brightness for generated colors if Color Mode is set to Spark or Firework">
        <label for="brightnessMin" class="indent" title="Minimum brightness for generated colors if Color Mode is set to Spark or Firework">Min Brightness</label><br>
        <select id="randSize" name="randSize" title="Method of generating spark sizes">
          <option value="spark" selected title="Each spark is a new random size">Spark</option>
          <option value="firework" title="Every spark in a firework is the same random size">Firework</option>
        </select>
        <label for="randSize" title="Method of generating spark sizes">Size</label><br>
        <input type="checkbox" id="sizeGrav" name="sizeGrav" class="indent" checked title="Closer sparks will fall faster">
        <label for="sizeGrav" title="Closer sparks will fall faster">Size to Gravity</label><br>
        <input type="number" id="sizeMin" name="sizeMin" value="2" title="Minimun spark size">
        <label for="sizeMin" class="indent" title="Minimun spark size">Min</label><br>
        <input type="number" id="sizeMax" name="sizeMax" value="8" title="Maximun spark size">
        <label for="sizeMax" class="indent" title="Maximun spark size">Max</label><br>
        <p title="Distance sparks fly from the center of their firework (radius)">Spark Distance</p>
        <input type="number" id="sparkDistMin" name="sparkDistMin" value="0" title="Minimum distance sparks fly from the center of their firework (radius)">
        <label for="sparkDistMin" class="indent" title="Minimum distance sparks fly from the center of their firework (radius)">Min</label><br>
        <input type="number" id="sparkDistMax" name="sparkDistMax" value="100" title="Maximum distance sparks fly from the center of their firework (radius)">
        <label for="sparkDistMax" class="indent" title="Minimum distance sparks fly from the center of their firework (radius)">Max</label><br>
        <p title="Multiplier for the distance sparks fly from the center of their firework (radius)">Firework Distance</p>
        <input type="number" id="fireworkDistMin" name="fireworkDistMin" value="1" title="Minimun multiplier for the distance sparks fly from the center of their firework (radius)">
        <label for="fireworkDistMin" class="indent" title="Minimun multiplier for the distance sparks fly from the center of their firework (radius)">Min</label><br>
        <input type="number" id="fireworkDistMax" name="fireworkDistMax" value="4" title="Maximun multiplier for the distance sparks fly from the center of their firework (radius)">
        <label for="fireworkDistMax" class="indent" title="Maximun multiplier for the distance sparks fly from the center of their firework (radius)">Max</label><br>
        <p title="Number of sparks in a firework">Sparks</p>
        <input type="number" id="sparksMin" name="sparksMin" value="40" title="Minimun number of sparks in a firework">
        <label for="sparksMin" class="indent" title="Minimun number of sparks in a firework">Min</label><br>
        <input type="number" id="sparksMax" name="sparksMax" value="80" title="Maximun number of sparks in a firework">
        <label for="sparksMax" class="indent" title="Maximun number of sparks in a firework">Max</label><br>
        <p title="Calculations for spark fade timing">Fade</p>
        <input type="number" id="fadeMin" name="fadeMin" value="1000" title="Minimum fade time start">
        <label for="fadeMin" class="indent" title="Minimum fade time start">Min</label><br>
        <input type="number" id="fadeMax" name="fadeMax" value="2000" title="Maximum fade time start">
        <label for="fadeMax" class="indent" title="Maximum fade time start">Max</label><br>
        <input type="number" id="fadeDur" name="fadeDur" value="2000" title="Duration of fade">
        <label for="fadeDur" class="indent" title="Duration of fade">Duration</label><br>
        <p title="Rate at which gravty accelerates sparks downwards">Gravity</p>
        <input type="number" id="gravityMin" name="gravityMin" value="100" title="Minimum rate at which gravty accelerates sparks downwards">
        <label for="gravityMin" class="indent" title="Minimum rate at which gravty accelerates sparks downwards">Min</label><br>
        <input type="number" id="gravityMax" name="gravityMax" value="200" title="Maximum rate at which gravty accelerates sparks downwards">
        <label for="gravityMax" class="indent" title="Maximum rate at which gravty accelerates sparks downwards">Max</label><br>
      </form>
      <button id="reset" title="Reset all settings to default">Reset</button>
    </footer>
    <script>

      /* HTML Element Variables */

      const main = document.getElementsByTagName("main")[0];
      const footer = document.getElementsByTagName("footer")[0];
      const fullscreen = document.getElementById("fullscreen");
      const share = document.getElementById("share");
      const auto = document.getElementById("auto");
      let randomInterval;
      const delayMin = document.getElementById("delayMin");
      const delayMax = document.getElementById("delayMax");
      const pause = document.getElementById("pause");
      const randColor = document.getElementById("randColor");
      const brightnessMin = document.getElementById("brightnessMin");
      const color = document.getElementById("color");
      const randSize = document.getElementById("randSize");
      const sizeGrav = document.getElementById("sizeGrav");
      const sizeMin = document.getElementById("sizeMin");
      const sizeMax = document.getElementById("sizeMax");
      const sparkDistMin = document.getElementById("sparkDistMin");
      const sparkDistMax = document.getElementById("sparkDistMax");
      const fireworkDistMin = document.getElementById("fireworkDistMin");
      const fireworkDistMax = document.getElementById("fireworkDistMax");
      const sparksMin = document.getElementById("sparksMin");
      const sparksMax = document.getElementById("sparksMax");
      const fadeMin = document.getElementById("fadeMin");
      const fadeMax = document.getElementById("fadeMax");
      const fadeDur = document.getElementById("fadeDur");
      const gravityMin = document.getElementById("gravityMin");
      const gravityMax = document.getElementById("gravityMax");
      const reset = document.getElementById("reset");



      /* Utility Functions */

      //Random between
      function random(min, max) {
        return min === max ? min : Math.random() * (max - min) + parseInt(min);
      }
      
      //Random timing
      function setRandomInterval(func, minDelay, maxDelay) {
        let timeout;
        let running = 1;
        function runInterval() {
          function timeoutFunction () {
            func();
            runInterval();
          }
          timeout = setTimeout(timeoutFunction, random(minDelay, maxDelay));
        }
        runInterval();
        return {
          clear() {
            clearTimeout(timeout);
            running = 0;
          }, isRunning() {
            return running;
          }
        };
      }



      /* Params */

      function updateVals() {
        const params = new window.URLSearchParams(window.location.search);
        if (params) {
          for(const entry of params.entries()) {
            const el = document.getElementById(entry[0]);
            if (el) {
              el.value = entry[1];
            }
          }
          if (!params.has("auto")) {
            auto.checked = false;
            if (randomInterval) {
              randomInterval.clear();
            }
            delayMin.classList.add("disabled");
            delayMax.classList.add("disabled");
          } else {
            auto.checked = true;
            if (!randomInterval || !randomInterval.isRunning()) {
              randomInterval = setRandomInterval(randFirework, delayMin.value, delayMax.value);
            }
            delayMin.classList.remove("disabled");
            delayMax.classList.remove("disabled");
          }
          pause.checked = params.has("pause");
          if (params.get("randColor") === "chosen") {
            color.classList.remove("disabled");
            brightnessMin.classList.add("disabled");
          } else {
            color.classList.add("disabled");
            brightnessMin.classList.remove("disabled");
          }
          if (params.get("randSize") == "firework") {
            sizeGrav.classList.add("disabled");
          } else {
            sizeGrav.classList.remove("disabled");
          }
          sizeGrav.checked = params.has("sizeGrav");
        }
      }

      window.addEventListener("popstate", function (e) {
        updateVals();
      });

      function getCurrentParams() {
        const params = Array.from(new FormData(document.getElementsByTagName("form")[0]).entries());
        let string = "?";
        for (let i = 0; i < params.length; i++) {
          string += params[i][0] + "=" + params[i][1].replace("#", "%23") + "&";
        }
        return string.substring(0, string.length - 1);
      }

      function updateParams() {
        history.pushState(null, "Fireworks", getCurrentParams());
      }

      const params = new window.URLSearchParams(window.location.search);
      if (Array.from(params).length) {
        updateVals();
      } else {
        randomInterval = setRandomInterval(randFirework, delayMin.value, delayMax.value);
        updateParams();
      }




      /* Firework Functions */

      function genColor() {
        let col = [0, 0, 0];
        while (Math.sqrt(0.299*Math.pow(col[0], 2) + 0.587*Math.pow(col[1], 2) + 0.114*Math.pow(col[2], 2)) < brightnessMin.value) {
          for (let i = 0; i < 3; i++) {
            col[i] = Math.random()*(1<<8);
          }
        }
        for (let i = 0; i < 3; i++) {
          col[i] = ("0"+(col[i]|0).toString(16)).slice(-2);
        }
        return "#" + col[0] + col[1] + col[2];
      }

      function createSpark(x, y, col, siz, dist) {
        const spark = document.createElement("div");
        spark.classList.add("spark");
        if (randColor.value === "spark") {
          spark.style.backgroundColor = genColor();
        } else if (randColor.value === "firework") {
          spark.style.backgroundColor = col;
        } else {
          spark.style.backgroundColor = color.value;
        }
        const fallRand = Math.random();
        if (randSize.value === "spark") {
          siz = (sizeGrav.checked ? fallRand : Math.random()) * (sizeMax.value - sizeMin.value) + parseInt(sizeMin.value);
          spark.style.height = siz + "px";
          spark.style.width = siz + "px";
        } else {
          spark.style.height = siz + "px";
          spark.style.width = siz + "px";
        }
        spark.style.top = y - siz / 2 + "px";
        spark.style.left = x - siz / 2 + "px";
        const dir = Math.random() * 2 * Math.PI;
        const rand = dist * random(sparkDistMin.value, sparkDistMax.value);
        spark.style.setProperty("--vertical", rand * Math.sin(dir) + "px");
        spark.style.setProperty("--horizontal", rand * Math.cos(dir) + "px");
        spark.style.setProperty("--fadeDelay", random(fadeMin.value, fadeMax.value) + "ms");
        spark.style.setProperty("--fadeDur", fadeDur.value + "ms");
        spark.style.setProperty("--fall", fallRand * (gravityMax.value - gravityMin.value) + parseInt(gravityMin.value) + "px");
        spark.style.setProperty("--time", parseInt(fadeMax.value) + parseInt(fadeDur.value) + "ms");
        main.append(spark);
        if (!pause.checked) {
          setTimeout(function() {
            spark.remove();
          }, parseInt(fadeMax.value) + parseInt(fadeDur.value));
        }
        return spark;
      }

      function createFirework(x, y) {
        const sparks = random(sparksMin.value, sparksMax.value);
        const col = genColor();//Random color (no min): "#"+("00000"+(Math.random()*(1<<24)|0).toString(16)).slice(-6);
        const siz = random(sizeMin.value, sizeMax.value);
        const dist = random(fireworkDistMin.value, fireworkDistMax.value);
        let sparkList = [];
        for (let i = 0; i < sparks; i++) {
          sparkList.push(createSpark(x, y, col, siz, dist));
        }
        if (!pause.checked) {
          setTimeout(function () {
            for (let i = 0; i < sparks; i++) {
              sparkList[i].classList.add("start");
            }
          });
        }        
      }

      function randFirework() {
        createFirework(Math.random() * main.offsetWidth, Math.random() * main.offsetHeight);
      }



      /* Listeners */

      main.addEventListener("click", function(e) {
        createFirework(e.offsetX, e.offsetY);
      });

      fullscreen.addEventListener("click", function() {
        footer.style.display = "none";
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          footer.style.display = "block";
        }
      });

      share.addEventListener("click", function() {
        const url = window.location.href;
        if (navigator.share) {
          navigator.share({
            title: "Fireworks",
            url: url
          }).catch(console.error);
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).catch(console.error);
        } else {
          alert(url);
        }
      });

      auto.addEventListener("click", function() {
        if (this.checked) {
          delayMin.classList.remove("disabled");
          delayMax.classList.remove("disabled");
          randomInterval = setRandomInterval(randFirework, delayMin.value, delayMax.value);
        } else {
          delayMin.classList.add("disabled");
          delayMax.classList.add("disabled");
          randomInterval.clear();
        }
        updateParams();
      });

      delayMin.addEventListener("change", function() {
        this.value = Math.max(0, Math.min(this.value, delayMax.value));
        if (auto.checked) {
          randomInterval.clear();
          randomInterval = setRandomInterval(randFirework, delayMin.value, delayMax.value);
        }
        updateParams();
      });

      delayMax.addEventListener("change", function() {
        this.value = Math.max(this.value, delayMin.value);
        if (auto.checked) {
          randomInterval.clear();
          randomInterval = setRandomInterval(randFirework,  delayMin.value, delayMax.value);
        }
        updateParams();
      });
      
      pause.addEventListener("click", function() {
        if (!this.checked) {
          const sparkList = document.getElementsByClassName("spark");
          for (let i = 0; i < sparkList.length; i++) {
            const spark = sparkList[i];
            spark.classList.add("start");
            setTimeout(function() {
              spark.remove();
            }, parseInt(fadeMax.value) + parseInt(fadeDur.value));
          }
        }
        updateParams();
      });

      randColor.addEventListener("change", function() {
        if (this.value !== "chosen") {
          color.classList.add("disabled");
          brightnessMin.classList.remove("disabled");
        } else {
          color.classList.remove("disabled");
          brightnessMin.classList.add("disabled");
        }
        updateParams();
      });

      color.addEventListener("change", function() {
        updateParams();
      });
      
      brightnessMin.addEventListener("change", function() {
        this.value = Math.max(this.min, Math.min(this.value, this.max));
        updateParams();
      });

      randSize.addEventListener("change", function() {
        if (randSize.value == "firework") {
          sizeGrav.classList.add("disabled");
        } else {
          sizeGrav.classList.remove("disabled");
        }
        updateParams();
      });

      sizeGrav.addEventListener("change", function() {
        updateParams();
      });

      //Min and max value calculations for number inputs
      const minMaxes = [[sizeMin, sizeMax], [sparkDistMin, sparkDistMax], [fireworkDistMin, fireworkDistMax], [sparksMin, sparksMax], [fadeMin, fadeMax], [gravityMin, gravityMax]];
      for (let i = 0; i < minMaxes.length; i++) {
        minMaxes[i][0].addEventListener("change", function() {
          this.value = Math.max(0, Math.min(this.value, minMaxes[i][1].value));
          updateParams();
        });
        minMaxes[i][1].addEventListener("change", function() {
          this.value = Math.max(this.value, minMaxes[i][0].value);
          updateParams();
        });
      }

      fadeDur.addEventListener("change", function() {
        this.value = Math.max(0, this.value);
        updateParams();
      });

      reset.addEventListener("click", function() {
        window.location = window.location.href.split("?")[0];
      });
    </script>
  </body>
</html>
