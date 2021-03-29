+++
title = "My Work History"
date = 2019-11-15
category = "Works"

[taxonomies]
categories = ["Work"]
+++

A long description of my work history.

I've been doing software engineering for a while now, in a number of different contexts.
These are some of the experiences I've had along the way and occassionally how I feel about some of them.

<!-- more -->

### [Assembly (YCS15)](http://assembly.com) - CTO:
#### 2014-2018: GetScale became Assembly. Fulfillment, Sourcing, and Process Control

From 2014 to 2018 I led an international team of engineers in Redwood
City, CA and Shanghai, China. I established practices around engineering,
security and operations. I participated in hiring and firing, building company
culture, and worked with sales and operations. Both participating in and
eventually leaving Assembly were some of the hardest things I've ever
done. I'm grateful for everyone I ever had the opprotunity to work with
there and to my co-founder Jonathan for all of their hard work and support
throughout the experience.
<br/>
<img src="/images/colton-jon.JPG" width="200px" />
<br/>
<img src="/images/assembly.png" width="200px" />

##### mDNS based local peer discovery and Console Network - 2017

* This enabled our consoles to communicate internally within a client facility.
We needed to allow consoles further down an assembly line to be notified
when they encountered units that had failed particular criteria. This needed to
happen while it was possible that the consoles would not be able to
communicate out of the facility.

* Consoles would broadcast over mDNS, perform leader election, and replicate
their logs across one another. Locally clients would query their log for the
state of units the network had encountered. Consoles would display
notifications when they had lost connection to the network or were otherwise
trailing behind the shared log of the network.

<img src="/images/console-network.JPG" width="200px" />

##### Source controlled Devops - 2017

* We imposed a requirement that all of our developer operational tools
exist and be documented in our source repository. This allowed any of our
engineers to view our current configuration and allowed auditable
management of changes to our infrastructure. Our infrastructure was
managed as kubernetes clusters in China and the US on separate cloud
providers, defined using initially CloudFormation in a clojure DSL and
then Terraform.

##### Warehouse Service Sales and Support - 2017

* With the addition of warehousing services in the US in 2017 I managed the
migration and handover of multiple warehousing clients to our service as we
acquired the customer base of another organization.

* I particpated in sales and support calls both solo and with the support of
our team with new and existing customers.

<img src="/images/assembly-warehouse.JPG" width="200px" />

##### Support for operating in bandwidth limited environments - 2016

* Our customers were located in rural locations with hard bandwidth
limitations. For this reason our collection of video and image data
required support of bandwidth utiliziation tracking, and compression on
locally installed edge services. Our systems were collecting extremely
similar imagery from unit to unit and we exploited this feature by
pre-training our compression libraries against these baselines and by
shipping differences rather than whole resources.

* Downloads of updates to the procedures and software included on our
consoles similarly used binary differences in their payloads rather than
re-downloading full copies of their resources.


##### LCD Character Recognition - 2016
* In order to better instrument less sophisticated final assembly and QA
processes we built a system for running optical character recognititon on
liquid crystal displays commonly used on scales, calipers, and other
existing equipment. This was implemented using Tesseract and OpenCV.

##### QR Code scanning performance - 2016
* Efficient QR Code scanning became critical to our operations as our
systems moved into manufacturing process control and quality assurance. We
produced internal software systems for faster qr decoding, camera focus, and
zoom. We also customized our hardware: our camera lenses, added rangefinding and
programmable lighting.

<img src="/images/QC-camera.png" width="200px" />

##### Log ingestion and transport - 2016
* This system ingested terabytes of data per day of temperature,
orientation, and behavior information from our consoles installed in the
field. Collecting and analyzing this data for online analysis and alerting
of process behavior and offline analysis of factory conditions.

##### Event sourcing model with reactive queries - 2015

* To improve developer productivity and better support collaboration between
international teams we moved our console management infrastructure to an
eventually consistent event sourcing model. On the client we allowed
queries to be defined in datascript and on the backend our configurations
were stored in Datomic.

* This allowed us to use not only a single
programming language (clojure/clojurescript) but a single query language
(datalog). All events dispatched on the client were handled on the server
in the same format and propagated to clients subscribed to those queries,
code for this system was shared on the client and server. Both the client
and server were operating over a normalized representation of the data in
a datalog database, where the client represented that user's accessible
subset of the data.

##### Delay tolerant networking infrastructure - 2015
* Our system was deployed into factories in rural locations, in locations
with constraints on access particular internet services. We provided a
service that managed multiple hops between different and particular
geographically located infrastructure providers and would queue all
intermediate data for reliable delivery.

#### [GetScale (YCS15)](http://getscale.com) - CTO:
2014: High volume consumer electronics manfacturing, tooling and management

##### Prototype Quality Control system - 2014

* Our team designed and built semi-custom touchscreen terminals and
camera/sensor packages that were deployed into factories in China and
the US. These systems were used to perform data collection during quality
control processes. We acquired an initial group of customers and built a
rudimentary system for managing the procedures displayed on the consoles
that could be managed from the US.

* We applied to and were accepted into Y Combinator for their Summer 2015
batch based on this system.

<img src="/images/QC-system.png" width="200px" />

##### Bill of Materials Optimization - 2014
* This allowed users to visualize the pricing of their bill of materials
at varying production quantities and then select appropriate quotations
from multiple vendors for pricing optimization at that target quantity.
We accounted for break bulk, minimum order quantities and unit
quotations and allowed users to interactively adjust part selections and
target quantities.

* The backend of this system was initially implemented in C and then later converted
to multithreaded Clojure as we extended support to a larger variety of suppliers.

* The frontend of this was implemented in ClojureScript and allowed
interactive zooming and exploration of the dataset across all parts in
the BoM.
<img src="/images/getscale-bom-optimization-2.png" width="200px" />

##### Product Lifecycle Management system - 2014

* The initial product we developed at GetScale was a PLM or Product Lifecycle Management system.
We provided a user interface for hierarchical bill of material management, version control, and
automated part quotation.

<img src="/images/getscale-plm.png" width="200px" />

#### [CircuitHub](http://circuithub.com) - Software Engineer: 
2013-2014: Small volume electronics manufacturing

##### Library managemnt
* Worked with CEO and designer to re-design and implement a new library management
interface. Libraries in this context are collections of footprints and
symbols used by electrical engineers in their designs.

<img src="/images/circuithub-library.png" width="200px" />

##### Footprint/symbol editor
* This allowed users to use Javascript and a small DSL to define and modify
symbols and footprints for use in the design of printed circuit boards (PCBs).
We provided a browser based interface for visualizing and iterating on designs
and a version control system for collaboration.

#### [BlackJet](http://blackjet.com) - Software Engineer: 
2013: Uber for private jets

##### Charter booking interface
* Implemented charter booking, allowing users to select routes, aircraft
of choice, and manage the quote selection process

##### Pricing Quote management

* Built infrastructure for managing quotes for charter flight. Implemented PDF generation.


#### [MixRank](http://mixrank.com) - Software Engineer: 
2012: Competitive advertising analytics

##### Site Redesign
* Worked on site redesign in Python/Pyramids/Javascript

#### [Flint Mobile Payment](https://www.flint.com) - Software Engineer: 
2012: Optical character recognition based mobile payments platform

##### Banking transaction protocol implementation
* Implemented bank transfer protocol in Nodejs

##### REST API
* Worked on the design and implementation of REST API