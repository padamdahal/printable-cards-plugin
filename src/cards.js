const queryString = window.location.search;
const params = new URLSearchParams(queryString);

const teiId = params.get('teiId');
const enrollmentId = params.get('enrollmentId');
const programId = params.get('programId');
const orgUnitId = params.get('orgUnitId');
const cardId = params.get("cardId");

//console.log('TEI ID =>'+teiId);
//console.log('ENROLLMENT ID =>'+enrollmentId);
//console.log('PROGRAM ID =>'+programId);
//console.log('ORG UNIT ID =>'+orgUnitId);

window.onload = function() {
	loadDataInCard();
};

async function loadDataInCard() {
    try {
		// Gather enrollmentData
		const url = "../../../api/tracker/enrollments/"+enrollmentId+"?fields=*";
		const enrollmentData = await fetchJSON(url);
		
		//const eventsUrl = "../../../../api/tracker/events?				program="+programId+"&orgUnit="+orgUnitId+"&trackedEntity="+teiId+"&paging=false";
		// Split attributes and events
    const events = enrollmentData.events;
		const attributes = enrollmentData.attributes;
		
		// Get User info
		const meUrl = '../../../api/me.json?fields=username,firstName,surname,organisationUnits[id,name,shortName,displayName]';
		const me = await fetchJSON(meUrl);
		
		const ouUrl = '../../../api/organisationUnits/'+orgUnitId+'?fields=id,name,displayName,code,parent[id,name,displayName,code,parent[id,name,displayName,code,parent[id,name,displayName,code,parent[id,name,displayName,code]]]]';
		const orgUnit = await fetchJSON(ouUrl);
		var optionSetCollection = {};
		
		// HTML element to render card inside
		const parentElement = document.getElementById('card');
		
		console.log('Getting list of cards');
		const cards = await fetchJSON('../../../api/dataStore/cardDesigner/'+cardId);
		const cardToRender = cards;
				
		console.log('Preparing optionSet collection');
		
		const optionSets = cardToRender.optionSets || {};
		const promises = Object.keys(optionSets).map(dataElementId => {
		  const optionSetId = optionSets[dataElementId];
		  if (!optionSetId) return Promise.resolve();
		  const url = "../../../api/optionSets/" + optionSetId + "?fields=options[code,name]";
		  return fetch(url)
			.then(res => res.json())
			.then(data => {
			  optionSetCollection[dataElementId] = data.options || [];
			});
		});

		Promise.all(promises).then(() => {
			console.log('Preparing card: '+cardToRender.name);
			var cardSections = cardToRender.sections;
			
			var cardHtmlString = "";
			const regex = /\{.+?\}/g;
			
			cardSections.forEach(section => {
				console.log("Processing card section.");
				var roughHtmlHeader = section.htmlHeader
				const htmlHeader = (roughHtmlHeader != undefined) ? roughHtmlHeader.replace(/<\/tbody>\s*<\/table>\s*$/, ''):'';
								
				var roughHtmlFooter = section.htmlFooter;
				const htmlFooter = (roughHtmlFooter) ? roughHtmlFooter.replace(/^\s*<table[^>]*>\s*<tbody>/, ''):'';
				
				if(section.type == 'single'){
					var htmlBody = section.htmlBody;
					const valuePlaceholders = htmlBody.match(regex);
					
					valuePlaceholders.forEach(placeholder => {
						let key = placeholder.replace(/[{}]/g, '').split(".")[0];
						let valueKey = placeholder.replace(/[{}]/g, '').split(".")[1];
						let attr = attributes.find(a => a.attribute == key);
					
						// Replace placeholders where it matches attributes
						if(attr){
							let value;
							if(Object.hasOwn(optionSetCollection, attr.attribute)) {
								const option = optionSetCollection[attr.attribute]?.find(opt => opt.code === attr.value);
								const name = option ? option.name : null;
								
								if(!valueKey || valueKey == 'value'){
									value = name;
								}else{
									value = attr[valueKey];
								}
							}else{
								if (!valueKey){
									valueKey = 'value';
								}
								
								value = attr[valueKey];	
							}
							
							if(isDate(value)){
								console.log('Value is date: ' + value);
								value = new Date(value).toISOString().split('T')[0];
								value = AD2BS(value);
							}
							
							if(value && value != undefined)
								console.log(placeholder + " => " + value);
								htmlBody = htmlBody.replaceAll(placeholder, value);
						}
						
						// Replace placeholders where it matches event/dataValues
						if(events){
							// Check for events
							let filteredEvents;
							if(section.programStage){
								filteredEvents = events.filter(ev => ev.programStage == section.programStage);
							}else{
								filteredEvents = events;
							}
							
							filteredEvents.forEach(event => {
								let value;
								
								if(key === "event"){
									if(!valueKey){
										value = event["status"];
									}else{
										value = event[valueKey];
									}
								}else{
									//filter datavalues with dataElement ID
									let dataValue = event.dataValues.find(dv => dv.dataElement == key);
									if(dataValue){
										// Check if dataElement key exists in optionSetCollection
										if(Object.hasOwn(optionSetCollection, dataValue.dataElement)) {
											const option = optionSetCollection[dataValue.dataElement]?.find(opt => opt.code === dataValue.value);
											const name = option ? option.name : null;
											if(!valueKey || valueKey == 'value'){
												value = name;
											}else{
												value = dataValue[valueKey];
											}
										}else{
											if (!valueKey){
												valueKey = 'value';
											}
											value = dataValue[valueKey];
										}
									}
								}
								if(isDate(value)){
									value = new Date(value).toISOString().split('T')[0];
									console.log(AD2BS(value));
									value = AD2BS(value);
								}
								if(value)
									htmlBody = htmlBody.replaceAll(placeholder, value);
							});
						}
						
						// Replace placeholders where it matches user info
						if(Object.keys(me).length != 0){
							value = me[key];
							//console.log(placeholder); console.log(key); console.log(value);
							if(value)
								htmlBody = htmlBody.replaceAll(placeholder, value);
						}
						
						// Replace Organisation Unit placeholders
						if (!valueKey){
							valueKey = 'displayName';
						}
						
						if(key === 'ou6'){
							value = orgUnit[valueKey];
						}else if(key === 'ou5'){
							value = orgUnit.parent[valueKey];
						}else if(key === 'ou4'){
							value = orgUnit.parent.parent[valueKey];
						}else if (key === 'ou3'){
							value = orgUnit.parent.parent.parent[valueKey];
						}else if(key === 'ou2'){
							value = orgUnit.parent.parent.parent.parent[valueKey];
						}
						if(value && value != undefined){
							console.log(placeholder + " => " + value);
							htmlBody = htmlBody.replaceAll(placeholder, value);
						}
					});
					
					cardHtmlString += htmlHeader + htmlBody + htmlFooter;	
					
				}
				
				if (section.type == 'repeatable'){
					var fullHtml = "";
					let filteredEvents;
					if(section.programStage){
						filteredEvents = events.filter(ev => ev.programStage == section.programStage);
					}else{
						filteredEvents = events;
					}
					
					filteredEvents.forEach(event => {
						const completeHtmlBody = section.htmlBody;

						// Strip off the table tags from the htmlBody
						var htmlBody = completeHtmlBody.replace(/^\s*<table[^>]*>\s*<tbody>/, '').replace(/<\/tbody>\s*<\/table>\s*$/, '');
						console.log(htmlBody);
						
						const regex = /\{.+?\}/g;
						const valuePlaceholders = htmlBody.match(regex);
						
						valuePlaceholders.forEach(placeholder => {
							console.log(placeholder);
							let key = placeholder.replace(/[{}]/g, '').split(".")[0];
							let valueKey = placeholder.replace(/[{}]/g, '').split(".")[1];
							if(key === "event"){
								if(!valueKey) value = event["status"];
								else value = event[valueKey];
								htmlBody = htmlBody.replaceAll(placeholder, value);
							} else {
								//filter datavalues with dataElement ID
								let dataValue = event.dataValues.find(dv => dv.dataElement == key);
								
								if(dataValue){
									// Check if dataElement key exists in optionSetCollection
									if(Object.hasOwn(optionSetCollection, dataValue.dataElement)) {
										const option = optionSetCollection[dataValue.dataElement]?.find(opt => opt.code === dataValue.value);
										const name = option ? option.name : null;
										if(!valueKey || valueKey == 'value'){
											value = name;
										}else{
											value = dataValue[valueKey];
										}
										
										if(isDate(value)){
											value = new Date(value).toISOString().split('T')[0];
											// Perform date conversion here
										}
											
										htmlBody = htmlBody.replaceAll(placeholder, value);
									}else{
										if(!valueKey){
											valueKey = 'value';
										}
										value = dataValue[valueKey];
										
										if(isDate(value)){
											value = new Date(value).toISOString().split('T')[0];
											console.log(AD2BS(value));
											value = AD2BS(value);
										}
										htmlBody = htmlBody.replaceAll(placeholder, value);
									}							
								}else{
									htmlBody = htmlBody.replaceAll(placeholder, 'NA');
								}
							}
						});
						fullHtml += htmlBody;
					});
					cardHtmlString += htmlHeader + fullHtml + htmlFooter;							
				}
				
				if(section.type != 'repeatable' && section.type != 'single'){
					console.log("Section type is not valid");
				}
			});
			
			// clean placeholders that were not replaced with real values
			const placeholdersToClean = cardHtmlString.match(regex)|| [];
			placeholdersToClean.forEach(placeholder => {
				cardHtmlString = cardHtmlString.replaceAll(placeholder, '');
			});
			
			parentElement.innerHTML = cardHtmlString;
			// load QR if required
			loadQR();
		});								
    } catch (e) {
        console.log('Error: ' + e.message);
        console.error(e);
    }
}

async function getOuInfo(ouId){
	
}

async function loadQR(){
	const healthId = document.getElementById('healthId').innerText;
    new QRCode(document.getElementById('qrcode'), {
      text: healthId,
      width: 100,
      height: 100
    });
}

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('DHIS2 API fetch failed');
    return res.json();
}

function isDate(value){
	//console.log(/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value).getTime()));
	value = (value)?value.substring(0,10):'';
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value).getTime());
}



		
