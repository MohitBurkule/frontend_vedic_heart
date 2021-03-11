//binder
document.getElementById("instructions_done").addEventListener("click", hide_instructions);
document.getElementById("start_btn").addEventListener("click", startReading);


$(function(){
        $("#mainform").on("submit", function(event) {
            event.preventDefault();

            var formData = {
                'hdata': $('input[name=hdata]').val() //for get hdata 
            };
            console.log(formData);

            $.ajax({
                url: "https://vedicheart.pythonanywhere.com/ml/api",
                type: "post",
                data: formData,
                success: function(d) {
                    alert(d);
                    d = JSON.parse(d);
                    console.log(d);
                    document.getElementById("ml_bar_image").src="data:image/png;base64,"+d['ml_bar']
                    $('#results_card').show();
                    
                },
                error: function() {
                    alert("some error ");
                }
            });
        });
    }) 

function hide_instructions(){
    $("#instruction_done").fadeOut("slow");
    document.getElementById("instructions_done").style.visibility = 'hidden';
    $.when($('#instruction_done').fadeOut())
   .then(function(){
      show_recorder();
   });
}
function show_recorder(){
    $("#recorder_card").removeAttr('hidden'); 
    $("#recorder_card").fadeIn("slow");
    $('html, body').animate({scrollTop: '0px'}, 300);
}

var start_timer=null;
var maxtimer=2*60000	
var video, width,stopped, height, context, graphCanvas, graphContext, bpm,track,torchMaxRetry;
var torchMaxRetry=5;
var hist = [];// older way of storing data [{bright:64,time:200},{bright:68,time:202},...] 
var stopped=false;
var heartData={bright:[],time:[]};// new way of storing data {bright:[64,68,..],time:[200,202,..]} 
navigator.getUserMedia = ( navigator.getUserMedia ||
                       navigator.webkitGetUserMedia ||
                       navigator.mozGetUserMedia ||
                       navigator.msGetUserMedia);
																	////https://stackoverflow.com/a/28991938

var constraints = { audio:false, video: { facingMode:"environment"} };

function set_maxtimer(x){
		maxtimer=x*60000// in milliseconds 
}
	
function startReading(){
        document.getElementById('guide_user').innerHTML='Grant Camera Permission'
		// Get the webcam's stream.// request user permission
		navigator.getUserMedia(constraints, startStream, function () {$('#no_camera').modal('show') });
		return false;
}

function reset(){
	hist = [];
	heartData={bright:[],time:[]}; 
	timer_start();
}

function timer_start()
{
	start_timer=Date.now();
}

function submitData()
{	
	stop_reading();
	document.getElementById("hdata").value=JSON.stringify(heartData);
	document.getElementById("mainform").submit();
}

function stop_reading()
{
	stopped=true;
	video.pause();
	bpm.innerHTML=" ";
    document.getElementById('guide_user').innerHTML='Sending reading ... please stay on the page';
}

function initialize() {
	navigator.mediaDevices.enumerateDevices().then(function(devices) {
	  devices.forEach(function(device) {
		console.log(device.kind + ": " + device.label +
					" id = " + device.deviceId/*, JSON.stringify(device,null,2)*/);
		if (device.kind=="videoinput" /*&& constraints.video===true*/)
		  constraints.video = { optional: [{sourceId: device.deviceId}, { fillLightMode: "on" }] };
	  });
	  initialize2();
	}).catch(function(err) {
	  console.log(err.name + ": " + err.message);
	});
}

function initialize2() {
    // The source video.
    video = document.getElementById("v");
    width = video.width;
    height = video.height;

    // The target canvas.
    var canvas = document.getElementById("c");
    context = canvas.getContext("2d");

    // The canvas for the graph
    graphCanvas = document.getElementById("g");
    graphContext = graphCanvas.getContext("2d");
 
    // The bpm meter
    bpm = document.getElementById("bpm");
    
    
}

function startStream(stream) {
    document.getElementById('guide_user').innerHTML='Recording Readings';
    document.getElementById('heart_beat_graph_title').style.visibility='visible';
	document.getElementById("start_btn").style.visibility = 'hidden';
	video.srcObject = stream;
	track = stream.getVideoTracks()[0];
	video.play();
	
	setTimeout(function(){ 
            track.applyConstraints({advanced: [{torch: true}]})
        //alert('Turning on flashlight , if present ');
    	}, 800); 
    
	timer_start();

    // Ready! Let's start drawing.
    requestAnimationFrame(draw);
  }

function draw() {
    var frame = readFrame();
    if (frame) {
      store_and_draw(frame.data);      
    }

    // Wait for the next frame.
    requestAnimationFrame(draw);
}

function readFrame() {
    try {
      context.drawImage(video, 0, 0, width, height);
    } catch (e) {
      // The video may not be ready, yet.
      return null;
    }
	if(torchMaxRetry!=0){
		track.applyConstraints({advanced: [{torch: true}]});
		torchMaxRetry=torchMaxRetry-1;
	}
    return context.getImageData(0, 0, width, height);
}

function store_and_draw(data) {
    var len = data.length;
    var sum = 0;
	if(stopped)//if stoppped then do not compute 
		return 
		
    for (var i = 0, j = 0; j < len; i++, j += 4) {
      sum += data[j] + data[j+1] + data[j+2]; // rgba 
    }
    document.getElementById("avg_bright").innerHTML="AVG BRIGHTNESS IS "+(sum/len).toFixed(2);
	
	//store brightness and time 
    hist.push({ bright : sum/len, time : Date.now() });
    heartData['bright'].push(sum/len);
    heartData['time'].push(Date.now());
	
	if(Date.now()-start_timer>maxtimer)
	{
		// if timeout then submit data
		submitData();
		return 
	}
	// else display time left 
	document.getElementById("time_left").innerHTML="Time left "+((maxtimer-(Date.now()-start_timer))/60000).toFixed(2)+' Minutes'
	
	//detect impulse 
	try{
		if( (Math.max(...heartData['bright'].slice(-300))-Math.min(...heartData['bright'].slice(-300)))>20)
		{
		// if in last 300 values => max-min>20 then impulse present 
			reset();
			console.log("reset");
			return ;
		}
	}
	catch (e){}
	
	
	/////////// below code to display graph 
	
    while (hist.length>graphCanvas.width) hist.shift();
    // max and min
    var max = hist[0].bright;
    var min = hist[0].bright;
    hist.forEach(function(v) {
      if (v.bright>max) max=v.bright;
      if (v.bright<min) min=v.bright;
    });
    // thresholds for bpm
    var lo = min*0.6 + max*0.4;
    var hi = min*0.4 + max*0.6;
    var pulseAvr = 0, pulseCnt = 0;
    // draw
    var ctx = graphContext;
    ctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
    ctx.beginPath();
    ctx.moveTo(0,0);
    hist.forEach(function(v,x) {
      var y = graphCanvas.height*(v.bright-min)/(max-min);
      ctx.lineTo(x,y);
    });       
    ctx.stroke();
    // work out bpm
    var isHi = undefined;
    var lastHi = undefined;
    var lastLo = undefined;
    ctx.fillStyle = "red";
    hist.forEach(function(v, x) {
      if (isHi!=true && v.bright>hi) {
        isHi = true;
        lastLo = x;
      }
      if (isHi!=false && v.bright<lo) {
        if (lastHi !== undefined && lastLo !== undefined) {
          pulseAvr += hist[x].time-hist[lastHi].time;
          pulseCnt++;
          ctx.fillRect(lastLo,graphCanvas.height-4,lastHi-lastLo,4);
        }
        isHi = false;
        lastHi = x;
      }
    });
    // write bpm
    if (pulseCnt) {
      var pulseRate = 60000 / (pulseAvr / pulseCnt);
      bpm.innerHTML = pulseRate.toFixed(0)+" BPM ("+pulseCnt+" pulses)";
    } else {
      bpm.innerHTML = "-- BPM";
    }
}

addEventListener("DOMContentLoaded", initialize);

